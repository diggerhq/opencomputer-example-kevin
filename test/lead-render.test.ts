import assert from "node:assert/strict";
import test from "node:test";

import type { AgentInput } from "@opencomputer/agent";

import Lead, { turnKind } from "../opencomputer/agents/lead/agent";
import { leadInstructions, TOOL_NAMES } from "../opencomputer/agents/lead/process/instructions";
import { render, slackMention } from "./helpers";

const ALL_TOOLS = [
  TOOL_NAMES.ask,
  TOOL_NAMES.commitDocument,
  TOOL_NAMES.consult,
  TOOL_NAMES.delegate,
  TOOL_NAMES.integrate,
  TOOL_NAMES.openPr,
  "sandbox_exec",
  TOOL_NAMES.whereAreWe,
].sort();
const EVENT_TOOLS = [TOOL_NAMES.commitDocument, TOOL_NAMES.delegate, TOOL_NAMES.integrate, "sandbox_exec", TOOL_NAMES.whereAreWe].sort();
const BOTH_CONNECTIONS = ["github", "management-api"];

/** A mention inside an existing thread, once the ingress names the thread. */
function threadReply(text: string): AgentInput {
  return {
    source: "channel",
    channel: {
      provider: "slack",
      connectionId: "conn-1",
      workspaceId: "T0000001",
      conversationId: "1759750000.000100",
      userId: "U0000001",
    },
    text,
  };
}

function outcome(type: "turn.completed" | "turn.failed", text?: string, error?: string): AgentInput {
  return {
    source: "event",
    event: {
      id: "evt-1",
      type,
      sessionId: "impl-session-1",
      turnId: "turn-1",
      agentId: "kevin--implementer",
      occurredAt: "2026-10-06T12:00:00Z",
      ...(text === undefined ? {} : { result: { text } }),
      ...(error === undefined ? {} : { error, reason: "runtime_error" }),
    },
  };
}

function consultAnswer(text: string, held: string[] = []): AgentInput {
  return {
    source: "subagent",
    text,
    payload: {
      kind: "consult_answer",
      memberAgentId: "kevin--reviewer",
      memberSessionId: "consult:lead-session-1:kevin--reviewer",
      memberTurnId: "turn-9",
      outcome: "completed",
    },
    answer: { questionId: "q-1", text },
    steering: held.map((item, index) => ({ text: item, receivedAt: `2026-10-06T12:0${index}:00Z` })),
  };
}

/** The JSON of the data block titled `title`. */
function dataOf(instructions: string, title: string): unknown {
  const at = instructions.indexOf(`# ${title}`);
  assert.ok(at >= 0, `missing block: ${title}`);
  const body = instructions.slice(at).match(/```json\n([\s\S]*?)\n```/)?.[1];
  return JSON.parse(body ?? "null");
}

/**
 * The rendered text is the lead's instructions for the turn kind, then data
 * blocks only: no router, no turn-specific instruction section.
 */
function assertInstructionsThenData(instructions: string, source: "channel" | "event" | "subagent", blocks: string[]): void {
  const text = leadInstructions({ source });
  assert.ok(instructions.startsWith(`${text}\n\n`), "the lead's text comes first");
  const headings = instructions.slice(text.length).match(/^# .+$/gm) ?? [];
  assert.deepEqual(headings, blocks.map((title) => `# ${title}`));
}

test("channel, a new thread: all tools selected; the instructions, then the thread line; no router", () => {
  const rendered = render(Lead, slackMention("add CSV export to the orders page"));
  assert.deepEqual(rendered.models, ["anthropic/claude-fable-5.1"]);
  assert.deepEqual(rendered.tools, ALL_TOOLS);
  assert.deepEqual(rendered.connections, BOTH_CONNECTIONS);
  assertInstructionsThenData(rendered.instructions, "channel", ["Thread"]);
  assert.match(rendered.instructions, /No thread id reaches you yet/);
});

test("channel, later turn: same selection; the thread id is handed to where_are_we", () => {
  const rendered = render(Lead, threadReply("design"));
  assert.deepEqual(rendered.tools, ALL_TOOLS);
  assert.deepEqual(rendered.connections, BOTH_CONNECTIONS);
  assertInstructionsThenData(rendered.instructions, "channel", ["Thread"]);
  assert.match(rendered.instructions, /Thread id: `1759750000\.000100`\. Pass it to `where_are_we` as `threadId`/);
});

test("a CLI or dashboard turn (source user) renders as a channel turn", () => {
  const rendered = render(Lead, { source: "user", text: "status?" });
  assert.equal(turnKind({ source: "user", text: "status?" }), "channel");
  assert.deepEqual(rendered.tools, ALL_TOOLS);
});

test("event: where_are_we, integrate, commit_document, delegate (+ shell); never open_pr or consult; the report parsed", () => {
  const report = {
    landed: [{ sha: "abc123", subject: "CSV endpoint" }],
    checks: { status: "pass", tail: "12 passing" },
    blocked: [],
    planAmendments: [],
  };
  const rendered = render(Lead, outcome("turn.completed", `Done.\n\n\`\`\`json\n${JSON.stringify(report)}\n\`\`\``));
  assert.deepEqual(rendered.tools, EVENT_TOOLS);
  assert.ok(!rendered.tools.includes(TOOL_NAMES.openPr) && !rendered.tools.includes(TOOL_NAMES.consult));
  assert.deepEqual(rendered.connections, BOTH_CONNECTIONS);
  assertInstructionsThenData(rendered.instructions, "event", ["The delivered outcome, parsed"]);
  assert.deepEqual(dataOf(rendered.instructions, "The delivered outcome, parsed"), {
    sessionId: "impl-session-1",
    type: "turn.completed",
    agentId: "kevin--implementer",
    report: { status: "reported", report },
  });
});

test("event: a failed turn or an unparseable report is a blocked stream with the tail quoted", () => {
  const failed = render(Lead, outcome("turn.failed", undefined, "model overloaded"));
  assert.deepEqual((dataOf(failed.instructions, "The delivered outcome, parsed") as { report: unknown }).report, {
    status: "blocked",
    reason: "turn.failed (runtime_error)",
    tail: "model overloaded",
  });
  const prose = render(Lead, outcome("turn.completed", "I could not finish.\nThe tests hang."));
  assert.deepEqual((dataOf(prose.instructions, "The delivered outcome, parsed") as { report: unknown }).report, {
    status: "blocked",
    reason: "no fenced report block",
    tail: "I could not finish.\nThe tests hang.",
  });
});

test("consult answer: all lead tools and consult; held messages first; the verdict parsed past the wrapper line", () => {
  const verdict = {
    verdict: "fix-first",
    findings: [{ id: "F1", severity: "high", file: "src/api.ts", line: 12, scenario: "commas break rows", change: "quote fields" }],
  };
  const rendered = render(
    Lead,
    consultAnswer(`Agent kevin--reviewer answered:\n\`\`\`json\n${JSON.stringify(verdict)}\n\`\`\``, ["also add TSV please"]),
  );
  assert.deepEqual(rendered.tools, ALL_TOOLS);
  assert.deepEqual(rendered.connections, BOTH_CONNECTIONS);
  assertInstructionsThenData(rendered.instructions, "subagent", ["Held messages (acknowledge these first)", "The reviewer's answer, parsed"]);
  assert.match(rendered.instructions, /# Held messages \(acknowledge these first\)\n- also add TSV please/);
  assert.deepEqual(dataOf(rendered.instructions, "The reviewer's answer, parsed"), {
    ...verdict,
    available: true,
    unsettled: false,
  });
});

test("consult answer: a reviewer that could not answer is fix-first, 'reviewer unavailable: <line>'", () => {
  const rendered = render(
    Lead,
    consultAnswer("Agent kevin--reviewer could not be consulted: the member agent did not settle the turn in time."),
  );
  const parsed = dataOf(rendered.instructions, "The reviewer's answer, parsed") as {
    verdict: string;
    findings: Array<{ scenario: string }>;
    available: boolean;
    unsettled: boolean;
  };
  assert.equal(parsed.verdict, "fix-first");
  assert.equal(parsed.available, false);
  assert.equal(parsed.unsettled, true);
  assert.deepEqual(parsed.findings.map((f) => f.scenario), [
    "reviewer unavailable: Agent kevin--reviewer could not be consulted: the member agent did not settle the turn in time.",
  ]);
  assert.match(rendered.instructions, /# Held messages\nNone\./);
});

test("anything else selects nothing", () => {
  for (const input of [
    { source: "subagent", text: "hi", payload: { kind: "consult" } },
    { source: "schedule", schedule: { id: "s", runId: "r", scheduledAt: "x", timezone: "UTC", attempt: 1, manual: false } },
  ] as AgentInput[]) {
    const rendered = render(Lead, input);
    assert.deepEqual(rendered.tools, []);
    assert.deepEqual(rendered.connections, []);
    assert.equal(turnKind(input), "other");
  }
});

test("a click or reply that answers the last ask is handed to the model with what was written before it", () => {
  const input: AgentInput = {
    ...threadReply("design"),
    answer: { questionId: "q-1", text: "design", value: "design" },
    steering: [{ text: "keep the file name fixed", receivedAt: "2026-10-06T12:00:00Z" }],
  };
  const rendered = render(Lead, input);
  assertInstructionsThenData(rendered.instructions, "channel", ["Thread", "This answers your question"]);
  assert.match(rendered.instructions, /# This answers your question\nChosen: `design`\./);
  assert.match(rendered.instructions, /Written before your question[^\n]*\n- keep the file name fixed/);
});

test("an outcome turn never selects ask (an open question would hold the next outcome)", () => {
  const rendered = render(Lead, outcome("turn.completed", "```json\n{}\n```"));
  assert.ok(!rendered.tools.includes("ask"));
});
