/**
 * The lead's writes through git on the computer: one cached clone per repo
 * under `runtime.cloneRoot`, fetched before every use. Only `agent/<slug>`, `agent/<slug>--*` and a docs repo's
 * default branch are ever pushed; callers check the branch.
 */
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { must, runtime } from "./exec";

const IDENTITY = ["-c", "user.name=Kevin", "-c", "user.email=kevin@noreply.opencomputer.dev", "-c", "commit.gpgsign=false"];

export function cloneDir(repo: string): string {
  return join(runtime.cloneRoot, repo);
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

const git = (dir: string, args: readonly string[]) => must("git", ["-C", dir, ...args]);

/** The repo's clone, cloned when missing, fetched always. */
export async function ensureClone(repo: string): Promise<string> {
  const dir = cloneDir(repo);
  if (!(await exists(join(dir, ".git")))) {
    await mkdir(dirname(dir), { recursive: true });
    await must("git", ["clone", "--quiet", `${runtime.remoteBase}${repo}.git`, dir]);
  }
  await git(dir, ["fetch", "--quiet", "--prune", "origin"]);
  return dir;
}

/** Refuses a clone with local changes (`git status --porcelain` must be empty). */
export async function requireClean(dir: string): Promise<void> {
  const status = (await git(dir, ["status", "--porcelain"])).trim();
  if (status) {
    throw new Error(
      `the clone at ${dir} is not clean (git status --porcelain: ${status.split("\n").slice(0, 5).join("; ")}); ` +
        `remove it (rm -rf ${dir}) and call again — it is a cache, the remote is the record`,
    );
  }
}

async function remoteHas(dir: string, branch: string): Promise<boolean> {
  const result = await runtime.exec("git", ["-C", dir, "rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branch}`]);
  return result.code === 0;
}

function checkPath(path: string): string {
  if (!path || path.startsWith("/") || path.split("/").some((part) => part === ".." || part === "" || part === ".git")) {
    throw new Error(`path must be relative inside the repo, got ${JSON.stringify(path)}`);
  }
  return path;
}

export interface CommitFileInput {
  repo: string;
  branch: string;
  path: string;
  message: string;
  /** The file's next content from its current one (null when the file does not exist yet). */
  next: (current: string | null) => string;
  /** Where a missing branch starts; the remote's default branch when omitted. */
  startPoint?: string;
}

/** Writes one file on a branch, commits and pushes it. A push race is retried from the new remote head. */
export async function commitFile(input: CommitFileInput): Promise<{ sha: string; changed: boolean }> {
  const path = checkPath(input.path);
  const dir = await ensureClone(input.repo);
  await requireClean(dir);
  for (let attempt = 1; ; attempt += 1) {
    const existed = await remoteHas(dir, input.branch);
    const start = existed ? `origin/${input.branch}` : input.startPoint ? `origin/${input.startPoint}` : "origin/HEAD";
    await git(dir, ["checkout", "--quiet", "-B", input.branch, start]);
    const file = join(dir, path);
    const current = (await exists(file)) ? await readFile(file, "utf8") : null;
    const next = input.next(current);
    if (next === current && existed) {
      return { sha: (await git(dir, ["rev-parse", "HEAD"])).trim(), changed: false };
    }
    if (next !== current) {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, next);
      await git(dir, ["add", "--", path]);
      await git(dir, [...IDENTITY, "commit", "--quiet", "-m", input.message]);
    }
    const pushed = await runtime.exec("git", ["-C", dir, "push", "--quiet", "origin", `HEAD:refs/heads/${input.branch}`]);
    if (pushed.code === 0) {
      return { sha: (await git(dir, ["rev-parse", "HEAD"])).trim(), changed: next !== current };
    }
    if (attempt >= 3) throw new Error(`git push to ${input.branch} failed: ${pushed.stderr.trim()}`);
    await git(dir, ["fetch", "--quiet", "--prune", "origin"]);
  }
}

export type MergeResult =
  | { merged: true; sha: string; alreadyMerged: boolean }
  | { merged: false; conflict: { stream: string; files: string[]; otherStream: string } };

/**
 * Merges `agent/<slug>--<stream>` into `agent/<slug>` with `--no-ff` and
 * pushes. On a conflict the merge is aborted and reported, never resolved:
 * `otherStream` is the stream whose changes touch the same
 * files, or `agent/<slug>` itself when no stream does.
 */
export async function mergeStream(repo: string, slug: string, stream: string): Promise<MergeResult> {
  const target = `agent/${slug}`;
  const source = `agent/${slug}--${stream}`;
  const dir = await ensureClone(repo);
  await requireClean(dir);
  for (const branch of [target, source]) {
    if (!(await remoteHas(dir, branch))) throw new Error(`${repo} has no branch ${branch}`);
  }
  await git(dir, ["checkout", "--quiet", "-B", target, `origin/${target}`]);
  if ((await runtime.exec("git", ["-C", dir, "merge-base", "--is-ancestor", `origin/${source}`, "HEAD"])).code === 0) {
    return { merged: true, sha: (await git(dir, ["rev-parse", "HEAD"])).trim(), alreadyMerged: true };
  }
  const merge = await runtime.exec("git", [
    "-C",
    dir,
    ...IDENTITY,
    "merge",
    "--no-ff",
    "--no-edit",
    "-m",
    `Merge stream ${stream} into ${target}`,
    `origin/${source}`,
  ]);
  if (merge.code !== 0) {
    const files = (await git(dir, ["diff", "--name-only", "--diff-filter=U"])).split("\n").filter(Boolean);
    await runtime.exec("git", ["-C", dir, "merge", "--abort"]);
    if (!files.length) throw new Error(`git merge ${source} failed: ${(merge.stderr || merge.stdout).trim()}`);
    return { merged: false, conflict: { stream, files, otherStream: await overlappingStream(dir, slug, stream, files) } };
  }
  const pushed = await runtime.exec("git", ["-C", dir, "push", "--quiet", "origin", `HEAD:refs/heads/${target}`]);
  if (pushed.code !== 0) {
    await git(dir, ["reset", "--quiet", "--hard", `origin/${target}`]);
    throw new Error(`git push to ${target} failed (call integrate again): ${pushed.stderr.trim()}`);
  }
  return { merged: true, sha: (await git(dir, ["rev-parse", "HEAD"])).trim(), alreadyMerged: false };
}

async function overlappingStream(dir: string, slug: string, stream: string, files: string[]): Promise<string> {
  const prefix = `origin/agent/${slug}--`;
  const branches = (await git(dir, ["for-each-ref", "--format=%(refname:short)", `refs/remotes/${prefix}*`]))
    .split("\n")
    .filter((branch) => branch && branch !== `${prefix}${stream}`);
  for (const branch of branches) {
    const base = (await git(dir, ["merge-base", `${prefix}${stream}`, branch])).trim();
    const changed = (await git(dir, ["diff", "--name-only", base, branch])).split("\n");
    if (files.some((file) => changed.includes(file))) return branch.slice(prefix.length);
  }
  return `agent/${slug}`;
}

/** A file's text on the remote branch (after a fetch), or null when the branch or the file is absent. */
export async function readRemoteFile(repo: string, branch: string, path: string): Promise<string | null> {
  const dir = await ensureClone(repo);
  const shown = await runtime.exec("git", ["-C", dir, "show", `refs/remotes/origin/${branch}:${checkPath(path)}`]);
  return shown.code === 0 ? shown.stdout : null;
}

/** The remote's default branch, from the clone's `origin/HEAD`. */
export async function remoteDefaultBranch(repo: string): Promise<string> {
  const dir = await ensureClone(repo);
  return (await git(dir, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])).trim().replace(/^origin\//, "");
}

/** Creates `branch` on the remote from the default branch when it does not exist yet. */
export async function ensureRemoteBranch(repo: string, branch: string): Promise<void> {
  const dir = await ensureClone(repo);
  if (await remoteHas(dir, branch)) return;
  await git(dir, ["push", "--quiet", "origin", `refs/remotes/origin/HEAD:refs/heads/${branch}`]);
  await git(dir, ["fetch", "--quiet", "--prune", "origin"]);
}
