import { defineTool } from "@opencomputer/agent";

import { commitDocument as commit } from "./lib/documents";
import { traced } from "./lib/telemetry";

/**
 * Writes, commits and pushes one document: same-repo → the code repo's `agent/<slug>`, created from the
 * default branch at the first go; docs repo → its default branch. Given
 * `state`, rewrites the plan's `kevin-state` block; given `version`, writes
 * `version:` into the header.
 */
export const commitDocument = defineTool({
  name: "commit_document",
  description:
    "Writes one document (a design or a plan), commits and pushes it, so the artifact lives in git rather than in the thread. " +
    "Returns { sha, url }: the commit and the document's link on its branch, the link a reader or a builder's assignment needs. " +
    "Given state, it rewrites the plan's kevin-state block; given version, the header's version: line; without content, " +
    "only those change in the existing file. Content identical to what is there makes no commit.",
  input: {
    type: "object",
    properties: {
      repo: { type: "string", description: "owner/name the document lives in: the code repo, or the docs repo when one is configured" },
      branch: {
        type: "string",
        description: "agent/<slug> in the code repo, created from its default branch on the first write; in the docs repo, its default branch",
      },
      path: {
        type: "string",
        description: "Repo-relative; the tools find the plan only at .agents/work/<slug>.md and the design only at .agents/design/<slug>.md",
      },
      content: { type: "string", description: "The whole file as it should read after this commit; omit to change only state or version" },
      message: { type: "string", description: "The commit message: what changed in the document" },
      state: {
        type: "object",
        description:
          "The plan's kevin-state, replacing the whole block: { version, leadSessionId?, threadId?, subscriptionId?, " +
          "streams: [{ stream, attempt, sessionId, branch, state }] }; leadSessionId defaults to yours. With your threadId in it, " +
          "where_are_we finds the work from any session in the thread. A stream's state is your word (landed, merged, blocked, …); " +
          "only running streams keep the subscription and count toward the limit",
      },
      version: {
        type: "integer",
        minimum: 0,
        description: "The artifact version this commit records (the n of v<n>); written to the header and the state, read back by where_are_we",
      },
    },
    required: ["repo", "branch", "path", "message"],
    additionalProperties: false,
  },
  async run(context) {
    const { input, sessionId } = context;
    return traced("commit_document", context, input, async () => {
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
    });
  },
});
