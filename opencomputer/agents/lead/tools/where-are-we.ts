import { defineTool } from "@opencomputer/agent";

import { config } from "../config";
import { deleteSubscriptions } from "./lib/api";
import { agentRefs, blobUrl, checkRepo, defaultBranch, ghFile, ghJson, installationRepos } from "./lib/github";
import { designPath, type KevinState, planPath, readHeaderVersion, readState } from "./lib/state";
import { traced } from "./lib/telemetry";

/** At most this many granted repos are searched when no repo is named. */
const MAX_REPOS = 30;
const BASE_LINE = /^\s*(?:[-*]\s+)?\**base\**\s*:\s*\**\s*`?([^\s`*]+)`?/im;

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

interface Found {
  repo: string;
  slug: string;
  plan: string;
  state: KevinState;
  planRepo: string;
  planBranch: string;
  refs: Array<{ branch: string; sha: string }>;
}

/**
 * Finds this thread's work: the
 * `agent/*` refs of the repo (or of every granted repo), each candidate's plan
 * read through the contents API, matched on the state's lead session id or
 * thread id. O(open branches); no clone.
 */
async function find(sessionId: string, threadId: string | undefined, repos: string[]) {
  const docs = config.docsRepo ? { repo: config.docsRepo, branch: await defaultBranch(config.docsRepo) } : undefined;
  const slugsInUse: string[] = [];
  for (const repo of repos) {
    const refs = await agentRefs(repo);
    for (const { branch } of refs) {
      const slug = branch.slice("agent/".length);
      if (slug.includes("--")) continue;
      slugsInUse.push(slug);
      const planRepo = docs?.repo ?? repo;
      const planBranch = docs?.branch ?? branch;
      const plan = await ghFile(planRepo, planPath(slug), planBranch);
      if (plan === null) continue;
      let state: KevinState | null;
      try {
        state = readState(plan);
      } catch {
        continue;
      }
      if (!state) continue;
      if (state.leadSessionId === sessionId || (threadId !== undefined && state.threadId === threadId)) {
        const found: Found = { repo, slug, plan, state, planRepo, planBranch, refs };
        return { found, slugsInUse };
      }
    }
  }
  return { found: undefined, slugsInUse };
}

/** The `where_are_we` result for found work. */
async function describe(found: Found, sessionId: string): Promise<Record<string, Json>> {
  const { repo, slug, plan, state, planRepo, planBranch, refs } = found;
  const branch = `agent/${slug}`;
  const base = plan.match(BASE_LINE)?.[1] ?? (await defaultBranch(repo));
  const design = await ghFile(planRepo, designPath(slug), planBranch);
  const planUrl = blobUrl(planRepo, planBranch, planPath(slug));
  const docs: Record<string, Json> = {
    ...(design !== null ? { design: blobUrl(planRepo, planBranch, designPath(slug)) } : {}),
    plan: planUrl,
    ...(/^##\s+Prompts\b/m.test(plan) ? { prompts: `${planUrl}#prompts` } : {}),
  };

  const [owner] = repo.split("/");
  const pulls =
    (await ghJson<Array<{ number: number; draft: boolean; merged_at: string | null; html_url: string }>>(
      `repos/${repo}/pulls?head=${encodeURIComponent(`${owner}:${branch}`)}&state=all&per_page=1`,
    )) ?? [];
  const pull = pulls[0];

  const streamRefs = refs.filter((ref) => ref.branch.startsWith(`${branch}--`));
  const names = new Set<string>();
  const streams: Json[] = [];
  const merged = async (streamBranch: string) => {
    if (!streamBranch || !streamRefs.some((ref) => ref.branch === streamBranch)) return false;
    const compare = await ghJson<{ ahead_by: number }>(`repos/${repo}/compare/${branch}...${streamBranch}`);
    return compare?.ahead_by === 0;
  };
  for (const stream of state.streams) {
    names.add(stream.stream);
    streams.push({
      name: stream.stream,
      branch: stream.branch,
      merged: await merged(stream.branch),
      ...(stream.sessionId ? { sessionId: stream.sessionId } : {}),
      attempt: stream.attempt,
      state: stream.state,
    });
  }
  for (const ref of streamRefs) {
    const name = ref.branch.slice(`${branch}--`.length);
    if (!names.has(name)) {
      streams.push({ name, branch: ref.branch, merged: await merged(ref.branch), attempt: 0, state: "unrecorded" });
    }
  }

  const commits =
    (await ghJson<Array<{ sha: string; commit: { message: string } }>>(
      `repos/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=5`,
    )) ?? [];

  // Nothing runs → nothing should wake this session: a live subscription would wake (and bill) an idle lead.
  let subscriptionDeleted = false;
  if (state.subscriptionId && !state.streams.some((stream) => stream.state === "running")) {
    subscriptionDeleted = (await deleteSubscriptions(state.leadSessionId || sessionId)) > 0;
  }

  return {
    slug,
    repo,
    branch,
    base,
    version: Math.max(state.version, readHeaderVersion(plan)),
    docs,
    ...(pull
      ? { pr: { number: pull.number, draft: pull.draft, merged: pull.merged_at !== null, url: pull.html_url } }
      : {}),
    streams,
    lastCommits: commits.map((commit) => ({ sha: commit.sha, subject: commit.commit.message.split("\n")[0] ?? "" })),
    state: state as unknown as Json,
    ...(subscriptionDeleted ? { subscriptionDeleted } : {}),
  };
}

/**
 * Where this thread's work stands, from GitHub alone.
 * Input `{ sessionId, threadId? }`: the session id defaults to the calling
 * session's; `repo` narrows the search (else every granted repo, ≤30).
 * A code tool running `gh api` on the computer with the installation token.
 */
export const whereAreWe = defineTool({
  name: "where_are_we",
  description:
    "What git holds for this thread's work, read from GitHub without a clone: know instead of recall. " +
    "Returns { slug, repo, branch, base, version, docs: { design?, plan, prompts? }, pr?: { number, draft, merged, url }, " +
    "streams: [{ name, branch, merged, attempt, state }], lastCommits, state }. " +
    "It finds work through a plan at .agents/work/<slug>.md whose kevin-state names your session or thread; " +
    "otherwise no slug, and slugsInUse lists taken slugs. With no stream running it deletes the outcome subscription.",
  input: {
    type: "object",
    properties: {
      sessionId: { type: "string", description: "Another lead session's id, to see the work it recorded; omitted, your own" },
      threadId: {
        type: "string",
        description: "This thread's id; finds work whose kevin-state carries it, including work another session in the thread started",
      },
      repo: { type: "string", description: "owner/name to search, faster when known; omitted, up to 30 granted repos are searched" },
    },
    additionalProperties: false,
  },
  async run(context) {
    const { input, sessionId: own } = context;
    return traced("where_are_we", context, input, async () => {
      const sessionId = typeof input.sessionId === "string" && input.sessionId ? input.sessionId : own;
      const threadId = typeof input.threadId === "string" && input.threadId ? input.threadId : undefined;
      const repos = input.repo === undefined ? (await installationRepos()).slice(0, MAX_REPOS) : [checkRepo(input.repo)];
      const { found, slugsInUse } = await find(sessionId, threadId, repos);
      if (found) return describe(found, sessionId);
      return {
        ...(input.repo === undefined ? {} : { repo: repos[0] as string }),
        base: input.repo === undefined ? "" : await defaultBranch(repos[0] as string),
        version: 0,
        docs: {},
        streams: [],
        lastCommits: [],
        slugsInUse,
      };
    });
  },
});
