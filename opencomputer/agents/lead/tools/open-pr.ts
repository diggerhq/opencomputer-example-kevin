import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { defineTool } from "@opencomputer/agent";

import { SLUG } from "./lib/assignment";
import { deleteSubscriptions } from "./lib/api";
import { must, runtime } from "./lib/exec";
import { checkRepo } from "./lib/github";

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
    "Open the draft PR for agent/<slug> (title, body = the PR description, base), or with ready: true mark it ready for review. " +
    "Deletes this session's outcome subscription. Returns { number, url, draft, subscriptionsDeleted }.",
  input: {
    type: "object",
    properties: {
      repo: { type: "string", description: "The code repo, owner/name" },
      slug: { type: "string" },
      base: { type: "string", description: "The branch the PR merges into (where_are_we.base)" },
      title: { type: "string" },
      body: { type: "string", description: "The PR description: what/why, decisions and risks, read first, verification, what remains, links" },
      ready: { type: "boolean", description: "true: mark the existing draft ready" },
    },
    required: ["repo", "slug"],
    additionalProperties: false,
  },
  async run({ input, sessionId }) {
    return openPullRequest(input, sessionId);
  },
});
