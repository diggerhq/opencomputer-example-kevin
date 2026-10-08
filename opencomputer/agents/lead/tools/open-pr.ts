import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { defineTool } from "@opencomputer/agent";

import { SLUG } from "./lib/assignment";
import { deleteSubscriptions } from "./lib/api";
import { must, runtime } from "./lib/exec";
import { checkRepo } from "./lib/github";
import { traced } from "./lib/telemetry";

interface PullRequest {
  number: number;
  url: string;
  isDraft: boolean;
}

async function view(repo: string, head: string): Promise<PullRequest> {
  return JSON.parse(await must("gh", ["pr", "view", head, "--repo", repo, "--json", "number,url,isDraft"])) as PullRequest;
}

/**
 * The PR:
 * `gh pr create --draft --base <base> --head agent/<slug> --title --body-file`;
 * `ready: true` → `gh pr ready`. Either way the session's outcome
 * subscription is deleted: nothing runs after the PR.
 */
export async function openPullRequest(input: Record<string, unknown>, leadSessionId: string) {
  const repo = checkRepo(input.repo);
  const slug = String(input.slug ?? "");
  if (!SLUG.test(slug)) throw new Error(`slug must be kebab-case, got ${JSON.stringify(slug)}`);
  const head = `agent/${slug}`;
  let pull: PullRequest;
  if (input.ready === true) {
    await must("gh", ["pr", "ready", head, "--repo", repo]);
    pull = await view(repo, head);
  } else {
    const base = String(input.base ?? "");
    const title = String(input.title ?? "");
    const body = String(input.body ?? "");
    if (!base || !title.trim() || !body.trim()) throw new Error("opening a PR needs base, title and body");
    const dir = await mkdtemp(join(tmpdir(), "kevin-pr-"));
    try {
      const bodyFile = join(dir, "body.md");
      await writeFile(bodyFile, body);
      const created = await runtime.exec("gh", [
        "pr", "create", "--draft", "--repo", repo, "--base", base, "--head", head, "--title", title, "--body-file", bodyFile,
      ]);
      if (created.code !== 0 && !/already exists/.test(created.stderr)) {
        throw new Error(`gh pr create failed: ${created.stderr.trim().split("\n").slice(-3).join(" ")}`);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
    pull = await view(repo, head);
  }
  const deleted = await deleteSubscriptions(leadSessionId);
  return { number: pull.number, url: pull.url, draft: pull.isDraft, subscriptionsDeleted: deleted };
}

export const openPr = defineTool({
  name: "open_pr",
  description:
    "Opens a draft pull request from agent/<slug> into base with your title and body, or with ready: true marks that draft " +
    "ready for review; useful when the work on agent/<slug> is ready for people to read on GitHub. A branch that already has " +
    "a PR gets that PR back unchanged. Either way it deletes your outcome subscriptions, since nothing should wake the thread " +
    "after the PR. Returns { number, url, draft, subscriptionsDeleted }.",
  input: {
    type: "object",
    properties: {
      repo: { type: "string", description: "The code repo, owner/name" },
      slug: { type: "string", description: "The work's slug; the PR's head is agent/<slug>" },
      base: { type: "string", description: "The branch the PR merges into, usually where_are_we's base; needed to open, ignored with ready" },
      title: { type: "string", description: "The PR title: the change in one plain line; needed to open, ignored with ready" },
      body: { type: "string", description: "The PR description in GitHub Markdown; needed to open, ignored with ready" },
      ready: { type: "boolean", description: "true marks the existing draft ready for review; base, title and body are then ignored" },
    },
    required: ["repo", "slug"],
    additionalProperties: false,
  },
  async run(context) {
    const { input, sessionId } = context;
    return traced("open_pr", context, input, async () => {
      return openPullRequest(input, sessionId);
    });
  },
});
