import assert from "node:assert/strict";
import test from "node:test";

import Implementer from "../opencomputer/agents/implementer/agent";
import Reviewer from "../opencomputer/agents/reviewer/agent";
import { ROLES } from "../process/roles";
import { render, subagentInput } from "./helpers";

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
