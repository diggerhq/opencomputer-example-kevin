import { defineTool } from "@opencomputer/agent";

import { commitDocument as commit } from "./lib/documents";

/**
 * Writes, commits and pushes one document (work 040 "Documents"; design 019
 * §6–§7): same-repo → the code repo's `agent/<slug>`, created from the
 * default branch at the first go; docs repo → its default branch. Given
 * `state`, rewrites the plan's `kevin-state` block; given `version`, writes
 * `version:` into the header.
 */
export const commitDocument = defineTool({
  name: "commit_document",
  description:
    "Write one document (design, plan) to its branch, commit and push it. Same repo: branch agent/<slug>. Docs repo: its default branch. " +
    "Pass the whole file as content; with state, the plan's kevin-state block is rewritten from it; with version, the header's version: line. " +
    "Omit content to rewrite only state/version of the existing file. Returns { sha, url }.",
  input: {
    type: "object",
    properties: {
      repo: { type: "string", description: "owner/name of the repo the document lives in" },
      branch: { type: "string", description: "agent/<slug>, or the docs repo's default branch" },
      path: { type: "string", description: ".agents/design/<slug>.md or .agents/work/<slug>.md unless the conventions say otherwise" },
      content: { type: "string", description: "The whole file" },
      message: { type: "string", description: "The commit message" },
      state: {
        type: "object",
        description: "The plan's kevin-state: { version, leadSessionId, threadId?, subscriptionId?, streams: [{ stream, attempt, sessionId, branch, state }] }",
      },
      version: { type: "integer", minimum: 0, description: "The version number this commit carries" },
    },
    required: ["repo", "branch", "path", "message"],
    additionalProperties: false,
  },
  async run({ input, sessionId }) {
    return commit(
      {
        repo: input.repo as string,
        branch: String(input.branch ?? ""),
        path: String(input.path ?? ""),
        ...(typeof input.content === "string" ? { content: input.content } : {}),
        message: String(input.message ?? ""),
        ...(input.state === undefined ? {} : { state: input.state }),
        ...(input.version === undefined ? {} : { version: input.version as number }),
      },
      sessionId,
    );
  },
});
