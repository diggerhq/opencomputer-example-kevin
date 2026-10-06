import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { config } from "../opencomputer/agents/lead/config";

const LINK = resolve(import.meta.dirname, "..", ".opencomputer", "project.json");

// `opencomputer link` writes .opencomputer/project.json; the lead's config.ts
// repeats the project id and slug because a tool cannot read the link at run
// time. A copy of this example that re-links must update both.
test("lead config matches the linked project", async (t) => {
  let text: string;
  try {
    text = await readFile(LINK, "utf8");
  } catch {
    t.diagnostic("no .opencomputer/project.json (project not linked here); nothing to compare");
    return;
  }
  const link = JSON.parse(text) as { projectId?: string; slug?: string; agentId?: string };
  assert.equal(config.projectId, link.projectId, "config.projectId differs from the linked project id");
  const slug = link.slug ?? link.agentId;
  if (slug !== undefined) assert.equal(config.agentPrefix, slug, "config.agentPrefix differs from the linked project slug");
});
