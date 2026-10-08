import { defineTool } from "@opencomputer/agent";

import { checkRepo } from "./lib/github";
import { mergeStream } from "./lib/git";
import { SLUG } from "./lib/assignment";
import { traced } from "./lib/telemetry";

/**
 * Merges one stream into the work branch: fetch, refuse a clone whose `git status --porcelain` is not empty,
 * `merge --no-ff agent/<slug>--<stream>` into `agent/<slug>`, push. On a
 * conflict: abort and report `{ stream, files, otherStream }`; never resolve.
 */
export const integrate = defineTool({
  name: "integrate",
  description:
    "Merges a builder's branch agent/<slug>--<stream> into agent/<slug> with a merge commit and pushes; useful when a landed " +
    "stream's work belongs on the branch the PR and later streams build on. Returns { merged: true, sha, alreadyMerged }; " +
    "repeating is harmless. On a conflict nothing changes: { merged: false, conflict: { stream, files, otherStream } } names " +
    "the files and the stream (or agent/<slug>) they collide with, what the builder's next attempt needs.",
  input: {
    type: "object",
    properties: {
      repo: { type: "string", description: "The code repo, owner/name" },
      slug: { type: "string", description: "The work's slug; agent/<slug> receives the merge" },
      stream: { type: "string", description: "The stream (kebab-case) whose branch agent/<slug>--<stream> is merged" },
    },
    required: ["repo", "slug", "stream"],
    additionalProperties: false,
  },
  async run(context) {
    const { input } = context;
    return traced("integrate", context, input, async () => {
      const slug = String(input.slug ?? "");
      const stream = String(input.stream ?? "");
      if (!SLUG.test(slug)) throw new Error(`slug must be kebab-case, got ${JSON.stringify(slug)}`);
      if (!SLUG.test(stream)) throw new Error(`stream must be kebab-case, got ${JSON.stringify(stream)}`);
      return mergeStream(checkRepo(input.repo), slug, stream);
    });
  },
});
