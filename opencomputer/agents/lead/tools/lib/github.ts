/**
 * GitHub reads through `gh api` with the deployment's installation token
 * (on the computer as GH_TOKEN). No clone: answering "where are we" reads refs
 * and files through the API, so it needs no checkout.
 */
import { runtime } from "./exec";

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function checkRepo(repo: unknown): string {
  if (typeof repo !== "string" || !REPO.test(repo)) {
    throw new Error(`repo must be owner/name, got ${JSON.stringify(repo)}`);
  }
  return repo;
}

/** `gh api <path>` parsed as JSON; null on 404. */
export async function ghJson<T>(path: string): Promise<T | null> {
  const result = await runtime.exec("gh", ["api", path]);
  if (result.code !== 0) {
    if (/HTTP 404/.test(result.stderr)) return null;
    throw new Error(`gh api ${path} failed: ${result.stderr.trim().split("\n").slice(-3).join(" ")}`);
  }
  return JSON.parse(result.stdout) as T;
}

/** A file's text at a ref through the contents API; null when absent. */
export async function ghFile(repo: string, path: string, ref: string): Promise<string | null> {
  const file = await ghJson<{ content?: string; encoding?: string }>(
    `repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`,
  );
  if (!file || typeof file.content !== "string") return null;
  return Buffer.from(file.content, (file.encoding as BufferEncoding | undefined) ?? "base64").toString("utf8");
}

export async function defaultBranch(repo: string): Promise<string> {
  const data = await ghJson<{ default_branch: string }>(`repos/${repo}`);
  if (!data) throw new Error(`${repo} is not visible to the GitHub installation`);
  return data.default_branch;
}

/**
 * Branch names under `agent/` with their head shas. A repository with no
 * commits has no branches: GitHub answers its refs with HTTP 409 "Git
 * Repository is empty", which is no work, not a failure (work 040 K48: one
 * empty granted repo used to fail every search across granted repos).
 */
export async function agentRefs(repo: string): Promise<Array<{ branch: string; sha: string }>> {
  const result = await runtime.exec("gh", ["api", `repos/${repo}/git/matching-refs/heads/agent/?per_page=100`]);
  if (result.code !== 0) {
    if (/HTTP 404/.test(result.stderr) || /HTTP 409/.test(result.stderr) && /empty/i.test(result.stderr)) return [];
    throw new Error(`gh api repos/${repo}/git/matching-refs failed: ${result.stderr.trim().split("\n").slice(-3).join(" ")}`);
  }
  const refs = JSON.parse(result.stdout) as Array<{ ref: string; object: { sha: string } }>;
  return refs.map((ref) => ({ branch: ref.ref.replace(/^refs\/heads\//, ""), sha: ref.object.sha }));
}

/** The repositories the installation grants, at most 100. */
export async function installationRepos(): Promise<string[]> {
  const data = await ghJson<{ repositories: Array<{ full_name: string }> }>("installation/repositories?per_page=100");
  return (data?.repositories ?? []).map((repository) => repository.full_name);
}

export function blobUrl(repo: string, branch: string, path: string): string {
  return `https://github.com/${repo}/blob/${branch}/${path}`;
}
