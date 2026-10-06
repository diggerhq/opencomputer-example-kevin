import assert from "node:assert/strict";
import test from "node:test";

import Implementer from "../opencomputer/agents/implementer/agent";
import Lead, { SCAFFOLD_REPLY } from "../opencomputer/agents/lead/agent";
import Reviewer from "../opencomputer/agents/reviewer/agent";
import { ROLES } from "../process/roles";
import { render, slackMention, subagentInput } from "./helpers";

test("lead answers a Slack mention with the fixed line, Fable, no tools and no connection", () => {
  const rendered = render(Lead, slackMention("<@U0KEVIN> add CSV export to the orders page"));
  assert.deepEqual(rendered.models, ["anthropic/claude-fable-5.1"]);
  assert.deepEqual(rendered.tools, []);
  assert.deepEqual(rendered.connections, []);
  assert.ok(rendered.instructions.endsWith(`\n\n${SCAFFOLD_REPLY}`));
});

test("implementer renders its role on Opus with a fixed reply", () => {
  const rendered = render(
    Implementer,
    subagentInput("Build stream api on agent/csv-export--api.", { kind: "build", stream: "api" }),
  );
  assert.deepEqual(rendered.models, ["anthropic/claude-opus-5.5"]);
  assert.deepEqual(rendered.tools, []);
  assert.ok(rendered.instructions.startsWith(ROLES.implementer));
  assert.match(rendered.instructions, /Implementer ready; no assignment handling yet\./);
});

test("reviewer renders its role on Fable with a fixed reply", () => {
  const rendered = render(Reviewer, subagentInput("Review the design for csv-export.", { kind: "consult" }));
  assert.deepEqual(rendered.models, ["anthropic/claude-fable-5.1"]);
  assert.deepEqual(rendered.tools, []);
  assert.ok(rendered.instructions.startsWith(ROLES.reviewer));
  assert.match(rendered.instructions, /Reviewer ready; no brief handling yet\./);
});
