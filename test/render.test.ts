import assert from "node:assert/strict";
import test from "node:test";

import Lead, { SCAFFOLD_REPLY } from "../opencomputer/agents/lead/agent";
import { render, slackMention } from "./helpers";

test("lead answers a Slack mention with the fixed line, Fable, no tools and no connection", () => {
  const rendered = render(Lead, slackMention("<@U0KEVIN> add CSV export to the orders page"));
  assert.deepEqual(rendered.models, ["anthropic/claude-fable-5.1"]);
  assert.deepEqual(rendered.tools, []);
  assert.deepEqual(rendered.connections, []);
  assert.ok(rendered.instructions.endsWith(`\n\n${SCAFFOLD_REPLY}`));
});
