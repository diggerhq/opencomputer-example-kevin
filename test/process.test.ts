/**
 * The process text: the lead's is identity, platform facts, values,
 * boundaries and the method (design 019 §2 "The model drives; the method is
 * a skill"); these tests hold its size and composition, not its phrasing.
 * The implementer's and reviewer's machine-parsed contracts stay exact.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { BOUNDARIES } from "../process/boundaries";
import { FACTS } from "../process/facts";
import {
  implementerInstructions,
  type LeadInput,
  leadInstructions,
  reviewerInstructions,
  TOOL_NAMES,
} from "../process/instructions";
import { METHOD } from "../process/method";
import { ASSIGNMENT_SHAPE, IMPLEMENTER_REPORT_SHAPE, PROMPTS_RULE, REVIEWER_REPORT_SHAPE } from "../process/reports";
import { ROLES } from "../process/roles";
import { VALUES } from "../process/values";

const ROOT = resolve(import.meta.dirname, "..");
const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

const CHANNEL: LeadInput = { source: "channel" };
const EVENT: LeadInput = { source: "event" };
const ANSWER: LeadInput = { source: "subagent" };
const KINDS = { channel: CHANNEL, event: EVENT, answer: ANSWER };

// ---- The lead: five parts, one text, a preface per turn ----

test("lead: identity, facts, values, boundaries and the method are in every turn kind's text", () => {
  for (const [kind, input] of Object.entries(KINDS)) {
    const text = leadInstructions(input);
    for (const [name, part] of Object.entries({ identity: ROLES.lead, facts: FACTS, values: VALUES, boundaries: BOUNDARIES, method: METHOD })) {
      assert.ok(text.includes(part), `${kind}: ${name}`);
    }
  }
});

test("lead: one text for every turn, after a one-line preface that names the turn", () => {
  const body = (text: string) => text.slice(text.indexOf("\n\n") + 2);
  const preface = (text: string) => text.slice(0, text.indexOf("\n\n"));
  const texts = Object.values(KINDS).map(leadInstructions);
  for (const text of texts) {
    assert.ok(!preface(text).includes("\n"), "the preface is one line");
    assert.equal(body(text), body(texts[0]!), "the same text after the preface");
  }
  assert.equal(new Set(texts.map(preface)).size, texts.length, "each turn kind has its own preface");
});

test("lead: the event preface names the builder's report; the consult-answer preface names the reviewer's answer and the person's messages", () => {
  const event = leadInstructions(EVENT).split("\n")[0]!;
  assert.match(event, /outcome/);
  assert.match(event, /report/);
  const answer = leadInstructions(ANSWER).split("\n")[0]!;
  assert.match(answer, /reviewer/);
  assert.match(answer, /answer/);
  assert.match(answer, /messages/);
});

test("lead: caps, so the text cannot regrow unnoticed (raising one needs a design in .agents/)", () => {
  const standing = words([ROLES.lead, FACTS, VALUES, BOUNDARIES].join("\n\n"));
  // 700 since 2026-10-08: the values open with why the work is interactive (design 019 §2 "Why interactive, not autonomous").
  assert.ok(standing <= 700, `identity + facts + values + boundaries: ${standing} words`);
  assert.ok(words(METHOD) <= 700, `method: ${words(METHOD)} words`);
});

test("contract: every tool the lead text names is a registered tool id", () => {
  const text = leadInstructions(CHANNEL);
  for (const name of Object.values(TOOL_NAMES)) assert.ok(text.includes(`\`${name}`), `missing tool: ${name}`);
  for (const stale of ["commit-document", "open-pr", "where-are-we"]) assert.ok(!text.includes(stale), `file name used as a tool id: ${stale}`);
});

// ---- Implementer and reviewer: contracts exact ----

test("contract: the report shapes reach their roles verbatim in a fenced json block", () => {
  assert.ok(implementerInstructions().includes(`\`\`\`json\n${IMPLEMENTER_REPORT_SHAPE}\n\`\`\``));
  assert.ok(reviewerInstructions().includes(`\`\`\`json\n${REVIEWER_REPORT_SHAPE}\n\`\`\``));
  assert.ok(implementerInstructions().includes(ASSIGNMENT_SHAPE), "the implementer validates the payload against this shape");
  assert.match(implementerInstructions(), /`checks` is `\{ "status": "pass", "tail": "" \}`/);
  assert.ok(reviewerInstructions().includes(PROMPTS_RULE));
});

test("boundaries: the implementer and the reviewer have their never-lists", () => {
  const implementer = implementerInstructions();
  assert.match(implementer, /Never merge/);
  assert.match(implementer, /never write documents/);
  assert.match(implementer, /Touch only the paths in `files`/);
  const reviewer = reviewerInstructions();
  assert.match(reviewer, /You never write/);
  assert.match(reviewer, /Run nothing/);
});

test("concepts: the implementer and the reviewer are told why their context is narrow", () => {
  assert.match(implementerInstructions(), /none of the conversation on purpose/);
  assert.match(implementerInstructions(), /boundary, not a hint/);
  assert.match(reviewerInstructions(), /judge what was built/);
});

test("sandbox facts: the implementer is told the computer's defaults, as facts, and the lead's text is unchanged by them", () => {
  const implementer = implementerInstructions();
  const block = implementer.slice(implementer.indexOf("# Sandbox facts"), implementer.indexOf("# Kinds"));
  assert.ok(block.startsWith("# Sandbox facts\n"), "one Sandbox facts block, before Kinds");
  assert.equal(implementer.split("# Sandbox facts").length, 2, "exactly one block");
  assert.match(block, /`NODE_ENV=production` is set/);
  assert.match(block, /`NODE_ENV=development npm ci --include=dev`/);
  assert.match(block, /no git identity/);
  assert.match(block, /`git -c user\.name=Kevin -c user\.email=kevin@noreply\.opencomputer\.dev commit/);
  assert.match(block, /`git log -1` after the first push/);
  assert.match(block, /`\/tmp\/opencode\/tmp` does not exist; `\/workspace\/tmp`/);
  assert.match(block, /`find`, `xargs` and `pgrep` are absent/);
  assert.match(block, /`ulimit -n` is 1024/);
  assert.match(block, /900 s/);
  assert.doesNotMatch(block, /\b(must|always|never)\b/i, "facts, not rules");
  for (const [kind, input] of Object.entries(KINDS)) {
    assert.ok(!leadInstructions(input).includes("# Sandbox facts"), `${kind}: the lead's size budget is untouched`);
  }
  assert.ok(words(block) <= 120, `the block is ${words(block)} words`);
});

test("conventions template: templates/conventions.md has its four sections (the lead reads a repo's own file, not a copy)", async () => {
  const template = await readFile(resolve(ROOT, "templates", "conventions.md"), "utf8");
  assert.deepEqual(template.match(/^## .+$/gm), ["## Ship directly", "## Always a plan first", "## Needs a design", "## Building"]);
});
