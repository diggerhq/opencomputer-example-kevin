import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import type { AgentInput } from "@opencomputer/agent";

import Reviewer, { parseBrief } from "../opencomputer/agents/reviewer/agent";
import { github } from "../opencomputer/agents/reviewer/connections/github";
import { reviewerInstructions } from "../process/instructions";
import { PROMPTS_RULE } from "../process/reports";
import { ROLES } from "../process/roles";
import { render, slackMention } from "./helpers";

const ROOT = resolve(import.meta.dirname, "..");

/** A consult as the platform dispatches it to the reviewer. */
const consult = (text: string): AgentInput => ({
  source: "subagent",
  text,
  payload: { kind: "consult", hostSessionId: "3f0c2a1e-lead", questionId: "q-1" },
});

/** The lead's prompt as process/lead.ts "Consulting the reviewer" composes it. */
const prompt = (brief: Record<string, string>) =>
  ["Review request.", "```json", JSON.stringify(brief, null, 2), "```", PROMPTS_RULE, "Budget: ≤10 minutes; read and reason, run nothing."].join("\n");

const DESIGN_BRIEF = {
  artifact: "design",
  slug: "csv-export",
  repo: "diggerhq/opencomputer-fixture-acme-service",
  base: "main",
  designUrl: "https://github.com/diggerhq/opencomputer-fixture-acme-service/blob/agent/csv-export/.agents/design/csv-export.md",
};

const BUILD_BRIEF = {
  ...DESIGN_BRIEF,
  artifact: "build",
  branch: "agent/csv-export",
  planUrl: "https://github.com/diggerhq/opencomputer-fixture-acme-service/blob/agent/csv-export/.agents/work/csv-export.md",
};

test("design consult: Fable, only the shell and the read-only github connection, the design named", () => {
  const rendered = render(Reviewer, consult(prompt(DESIGN_BRIEF)));
  assert.deepEqual(rendered.models, ["anthropic/claude-fable-5.1"]);
  assert.deepEqual(rendered.tools, ["sandbox_exec"]);
  assert.deepEqual(rendered.connections, ["github"]);
  assert.ok(rendered.instructions.startsWith(reviewerInstructions()));
  const own = rendered.instructions.slice(reviewerInstructions().length);
  assert.match(own, /^\n\n# This consult\n\nReview the design of `csv-export` \(https:\/\/github\.com\/.+design\/csv-export\.md\) against the code in `diggerhq\/opencomputer-fixture-acme-service` at `main`\./);
  assert.match(own, /it is for reading only/);
});

test("build consult: the integrated branch against its base, judged by design and plan", () => {
  const rendered = render(Reviewer, consult(prompt({ ...BUILD_BRIEF, docsRepo: "diggerhq/serverless-agents-ws" })));
  assert.deepEqual(rendered.tools, ["sandbox_exec"]);
  assert.deepEqual(rendered.connections, ["github"]);
  const own = rendered.instructions.slice(reviewerInstructions().length);
  assert.match(own, /Review the integrated branch `agent\/csv-export` of `csv-export` .* against `main` \(compare `main\.\.\.agent\/csv-export`\)/);
  assert.ok(own.includes(BUILD_BRIEF.planUrl));
  assert.match(own, /and the docs repo `diggerhq\/serverless-agents-ws`/);
});

test("rebuttal consult (no brief JSON): same tools, same report, ids kept", () => {
  const rendered = render(Reviewer, consult("My judgements: F1 declined (the cap is enforced upstream, src/orders/limit.ts:12). Hold or concede."));
  assert.deepEqual(rendered.tools, ["sandbox_exec"]);
  assert.match(rendered.instructions, /carries no brief JSON: it is a rebuttal/);
  assert.match(rendered.instructions, /keeping the finding ids/);
});

test("a brief that does not fit the shape is treated as no brief", () => {
  assert.equal(parseBrief(prompt({ ...DESIGN_BRIEF, artifact: "code" })), undefined);
  assert.equal(parseBrief(prompt({ ...DESIGN_BRIEF, designUrl: "file:///etc/passwd" })), undefined);
  assert.equal(parseBrief("```json\n{ not json\n```"), undefined);
  assert.deepEqual(parseBrief(prompt(BUILD_BRIEF)), BUILD_BRIEF);
});

test("anything but a consult (a direct message, an API turn, a consult answer) selects nothing", () => {
  for (const input of [
    slackMention("<@U0REVIEW> review my code"),
    { source: "user", text: "review", payload: { kind: "build" } } as AgentInput,
    { source: "subagent", text: "x", payload: { kind: "consult_answer" } } as AgentInput,
    { source: "subagent", text: "x" } as AgentInput,
  ]) {
    const rendered = render(Reviewer, input);
    assert.deepEqual(rendered.tools, [], input.source);
    assert.deepEqual(rendered.connections, [], input.source);
    assert.equal(rendered.instructions, `${ROLES.reviewer}\n\n# Not a consult\n\nThis input is not a consult from Kevin's lead. Reply with one line and do nothing else: "I review only on the lead's request."`);
  }
});

test("the reviewer can select nothing that writes: no defined tools, no ask or consult, a read-only token", async () => {
  // Every render path selects at most the shell and the github connection.
  for (const input of [consult(prompt(DESIGN_BRIEF)), consult(prompt(BUILD_BRIEF)), consult("rebuttal"), slackMention("hi")]) {
    const rendered = render(Reviewer, input);
    assert.ok(rendered.tools.every((tool) => tool === "sandbox_exec"), rendered.tools.join());
    assert.ok(rendered.connections.every((connection) => connection === "github"), rendered.connections.join());
    assert.deepEqual(rendered.services, []);
  }
  // Reviewers declare contents, pull_requests and metadata read; the token is minted from the declaration.
  assert.deepEqual(github.provider.permissions, { contents: "read", pull_requests: "read", metadata: "read" });
  // The manifest the CLI builds: literal tool ids of useTool calls in the agent source, and no tools/ directory.
  const source = await readFile(resolve(ROOT, "opencomputer/agents/reviewer/agent.ts"), "utf8");
  assert.deepEqual([...source.matchAll(/\buseTool\(\s*["']([^"']+)["']/g)].map((match) => match[1]), ["sandbox_exec"]);
  assert.doesNotMatch(source, /defineTool|ASK_TOOL|useSubagent|useMcpServer|useService/);
  const entries = await readdir(resolve(ROOT, "opencomputer/agents/reviewer"));
  assert.deepEqual(entries.filter((entry) => !["agent.ts", "connections", "process"].includes(entry)), []);
  assert.deepEqual(await readdir(resolve(ROOT, "opencomputer/agents/reviewer/connections")), ["github.ts"]);
});

test("the implementer's manifest carries the shell as a literal tool id", async () => {
  const source = await readFile(resolve(ROOT, "opencomputer/agents/implementer/agent.ts"), "utf8");
  assert.deepEqual([...source.matchAll(/\buseTool\(\s*["']([^"']+)["']/g)].map((match) => match[1]), ["sandbox_exec"]);
});
