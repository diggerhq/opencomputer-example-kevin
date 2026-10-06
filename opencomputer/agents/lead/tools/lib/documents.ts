/**
 * Documents and where they live:
 * same-repo mode → the code repo's `agent/<slug>`; docs-repo mode → the docs
 * repo's default branch. Only the lead writes them, one file per commit.
 */
import { config } from "../../config";
import { commitFile, readRemoteFile, remoteDefaultBranch } from "./git";
import { blobUrl, checkRepo } from "./github";
import { checkState, type KevinState, planPath, readState, writeHeaderVersion, writeState } from "./state";

const WORK_BRANCH = /^agent\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Where the plan of `slug` in `repo` lives. */
export async function planLocation(repo: string, slug: string): Promise<{ repo: string; branch: string; path: string }> {
  if (config.docsRepo) return { repo: config.docsRepo, branch: await remoteDefaultBranch(config.docsRepo), path: planPath(slug) };
  return { repo, branch: `agent/${slug}`, path: planPath(slug) };
}

export interface CommitDocumentInput {
  repo: string;
  branch: string;
  path: string;
  /** The whole file; omitted → the current file, with only `state` / `version` rewritten. */
  content?: string;
  message: string;
  /** Rewrites the plan's `kevin-state` block. */
  state?: unknown;
  /** Writes `version:` into the header (and the state block's version). */
  version?: number;
  /** For a branch that does not exist yet: the remote branch it starts from (default branch when omitted). */
  startPoint?: string;
}

/** Checks the boundary: documents go to `agent/<slug>`, or to the docs repo's default branch. */
async function checkDocumentBranch(repo: string, branch: string): Promise<void> {
  if (config.docsRepo && repo === config.docsRepo) {
    const main = await remoteDefaultBranch(repo);
    if (branch !== main) throw new Error(`documents in the docs repo ${repo} go to its default branch ${main}, not ${branch}`);
    return;
  }
  if (!WORK_BRANCH.test(branch)) throw new Error(`documents go to agent/<slug> in the code repo, not ${branch}`);
}

/** Writes, commits and pushes one document; returns its commit and link. */
export async function commitDocument(input: CommitDocumentInput, leadSessionId: string): Promise<{ sha: string; url: string }> {
  const repo = checkRepo(input.repo);
  await checkDocumentBranch(repo, input.branch);
  if (!input.message.trim()) throw new Error("message is required");
  if (input.version !== undefined && (!Number.isInteger(input.version) || input.version < 0)) {
    throw new Error("version must be a whole number");
  }
  if (input.state !== undefined && (!input.state || typeof input.state !== "object" || Array.isArray(input.state))) {
    throw new Error("state must be the kevin-state object");
  }
  const given =
    input.state === undefined ? undefined : checkState({ leadSessionId, ...(input.state as Record<string, unknown>) });
  const { sha } = await commitFile({
    repo,
    branch: input.branch,
    path: input.path,
    message: input.message,
    ...(input.startPoint ? { startPoint: input.startPoint } : {}),
    next: (current) => {
      let text = input.content ?? current;
      if (text === null) throw new Error(`${input.path} does not exist on ${input.branch}; pass its content`);
      let state: KevinState | null = given ?? null;
      if (input.version !== undefined) {
        text = writeHeaderVersion(text, input.version);
        state ??= readState(text);
        if (state) state = { ...state, version: input.version };
      }
      return state ? writeState(text, state) : text;
    },
  });
  return { sha, url: blobUrl(repo, input.branch, input.path) };
}

/** The plan's text and state on the remote, when the plan exists. */
export async function readPlan(repo: string, slug: string): Promise<{ text: string; state: KevinState | null } | null> {
  const location = await planLocation(repo, slug);
  const text = await readRemoteFile(location.repo, location.branch, location.path);
  return text === null ? null : { text, state: readState(text) };
}
