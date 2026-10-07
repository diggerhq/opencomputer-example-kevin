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
    "Merge stream branch agent/<slug>--<stream> into agent/<slug> (--no-ff) and push. Refuses a dirty clone. " +
    "On a conflict nothing is merged: returns { merged: false, conflict: { stream, files, otherStream } } — never resolve it yourself. " +
    "Returns { merged: true, sha, alreadyMerged } on success.",
  input: {
    type: "object",
    properties: {
      repo: { type: "string", description: "The code repo, owner/name" },
      slug: { type: "string" },
      stream: { type: "string" },
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
