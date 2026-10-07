/**
 * The process text (guidance, not a harness): these tests
 * hold the machine-parsed contracts exact and check that each turn kind
 * carries the concepts, mechanics and boundaries it needs. They do not pin
 * phrasing; rewording the guidance should not break them.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  implementerInstructions,
  type LeadInput,
  leadInstructions,
  reviewerInstructions,
  TOOL_NAMES,
  VERSION_MARKER,
} from "../process/instructions";
import {
  ASSIGNMENT_SHAPE,
  IMPLEMENTER_REPORT_SHAPE,
  LEAD_JUDGEMENT_SHAPE,
  PROMPTS_RULE,
  REVIEWER_BRIEF_SHAPE,
  REVIEWER_REPORT_SHAPE,
} from "../process/reports";
import { CHANNEL_TURN_START, MECHANICS, OPENING_TURN, STAGES } from "../process/lead";
import { DOCUMENT_SHAPES, SHAPES } from "../process/shapes";

const ROOT = resolve(import.meta.dirname, "..");
const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

const BRIEF: LeadInput = { source: "channel", firstTurn: true };
const CHANNEL: LeadInput = { source: "channel", firstTurn: false };
const EVENT: LeadInput = { source: "event", firstTurn: false };
const ANSWER: LeadInput = { source: "subagent", firstTurn: false };
const KINDS = { brief: BRIEF, channel: CHANNEL, event: EVENT, answer: ANSWER };

/** The text before the reference shapes: what the model is told, as opposed to shown. */
const guidance = (text: string) => text.split(SHAPES)[0]!.split(DOCUMENT_SHAPES)[0]!;

// ---- Contracts: exact ----

test("contract: the version marker line is **<slug>** · <stage> · v<n>, stated as a rule in every lead turn", () => {
  assert.equal(VERSION_MARKER, "**<slug>** · <stage> · v<n>");
  for (const [kind, input] of Object.entries(KINDS)) {
    assert.ok(guidance(leadInstructions(input)).includes(`marker line \`${VERSION_MARKER}\``), kind);
  }
});

test("contract: the report shapes reach their roles verbatim in a fenced json block", () => {
  assert.ok(implementerInstructions().includes(`\`\`\`json\n${IMPLEMENTER_REPORT_SHAPE}\n\`\`\``));
  assert.ok(reviewerInstructions().includes(`\`\`\`json\n${REVIEWER_REPORT_SHAPE}\n\`\`\``));
  assert.ok(implementerInstructions().includes(ASSIGNMENT_SHAPE), "the implementer validates the payload against this shape");
  assert.match(implementerInstructions(), /`checks` is `\{ "status": "pass", "tail": "" \}`/);
});

test("contract: the reviewer brief, the Prompts rule and the judgement shape reach the lead where it uses them", () => {
  for (const input of [CHANNEL, ANSWER]) {
    const text = leadInstructions(input);
    assert.ok(text.includes(REVIEWER_BRIEF_SHAPE));
    assert.ok(text.includes(PROMPTS_RULE));
  }
  assert.ok(leadInstructions(ANSWER).includes(LEAD_JUDGEMENT_SHAPE));
  assert.ok(reviewerInstructions().includes(PROMPTS_RULE));
  assert.match(leadInstructions(ANSWER), /`Agent <id> answered:`/);
  assert.match(leadInstructions(ANSWER), /reviewer unavailable/);
});

test("contract: the kevin-state block is written only through commit_document", () => {
  for (const input of [CHANNEL, EVENT, ANSWER]) {
    const text = leadInstructions(input);
    assert.match(text, /`kevin-state`/);
    assert.match(text, /hand-edit `kevin-state`/);
  }
});

test("contract: every tool the lead text names is a registered tool id", () => {
  const text = leadInstructions(CHANNEL);
  for (const name of Object.values(TOOL_NAMES)) assert.ok(text.includes(`\`${name}`), `missing tool: ${name}`);
  for (const stale of ["commit-document", "open-pr", "where-are-we"]) assert.ok(!text.includes(stale), `file name used as a tool id: ${stale}`);
});

// ---- Mechanics and boundaries: hard rules where the platform demands them ----

test("mechanics: mention line, held inputs around consult, no question after a dispatch, outcome turns post", () => {
  const text = leadInstructions(CHANNEL);
  assert.match(text, /typed replies need an @mention/);
  assert.match(text, /consult/);
  assert.match(text, /held/);
  assert.match(text, /never while implementers run/);
  assert.match(text, /never ends with a question/);
  assert.match(text, /outcome turn posts in the thread/);
  assert.match(text, /flattens tables/);
});

test("boundaries: each role has its never-list", () => {
  assert.match(leadInstructions(CHANNEL), /# Never\nWrite product code/);
  assert.match(leadInstructions(EVENT), /Never `open_pr`, never `consult`, never a question/);
  const implementer = implementerInstructions();
  assert.match(implementer, /Never merge/);
  assert.match(implementer, /never write documents/);
  assert.match(implementer, /Touch only the paths in `files`/);
  const reviewer = reviewerInstructions();
  assert.match(reviewer, /You never write/);
  assert.match(reviewer, /Run nothing/);
});

test("turn order: the channel turn starts from where_are_we; the opening turn triages", () => {
  const channel = leadInstructions(CHANNEL);
  assert.ok(channel.startsWith("You are Kevin's lead"));
  assert.match(channel, /call `where_are_we` before anything else/);
  assert.ok(channel.indexOf("# This turn") < channel.indexOf("# Stages"));
  const brief = leadInstructions(BRIEF);
  assert.match(brief, /# This turn: the thread's opening message/);
  assert.match(brief, /calling no tool — a brief needs no computer and promises no lookups/);
  assert.doesNotMatch(guidance(brief), /Call `where_are_we`/);
});

test("opening turn: three outcomes, two allowed read-only lookups, no clones", () => {
  assert.ok(leadInstructions(BRIEF).includes(OPENING_TURN));
  assert.match(OPENING_TURN, /- \*\*Work\*\*[^\n]*write the brief, version 1/);
  assert.match(OPENING_TURN, /- \*\*A question about you\*\*[^\n]*answer it/);
  assert.match(OPENING_TURN, /- \*\*Unclear\*\*: one question, no brief, no tool/);
  assert.match(OPENING_TURN, /`gh api installation\/repositories`/);
  assert.match(OPENING_TURN, /what work exists \(`where_are_we`\)/);
  assert.match(OPENING_TURN, /run that one read-only lookup/);
  assert.match(OPENING_TURN, /never clone or read code before there is work/);
});

test("stages: the stage model opens the block; each stage says what it is for", () => {
  assert.ok(STAGES.startsWith("# Stages\nA thread carries one thing"));
  assert.ok(leadInstructions(CHANNEL).includes(STAGES));
  for (const stage of ["Brief", "Design", "Plan", "Build", "Spike", "Status", "PR", "Live"]) {
    assert.match(STAGES, new RegExp(`- \\*\\*${stage}\\*\\* — so `), stage);
  }
});

test("mechanics: a question does not hold the thread; no PR link before open_pr returns one", () => {
  assert.match(MECHANICS, /A question does not hold the thread/);
  assert.match(MECHANICS, /an "Open question:" line naming the question and its options/);
  assert.match(MECHANICS, /re-ask only if the gate is still open/);
  assert.match(MECHANICS, /Each thread wakes only for its own builders/);
  assert.match(MECHANICS, /A PR exists once `open_pr` has returned its link, and not before/);
  assert.match(MECHANICS, /no PR link is written that did not come back from the tool/);
  for (const [kind, input] of Object.entries(KINDS)) assert.ok(leadInstructions(input).includes(MECHANICS), kind);
});

test("channel turn: a question gets a real answer, and the gate is re-asked only if still open", () => {
  assert.match(CHANNEL_TURN_START, /A question — about the work, an option, or you — gets a real answer first/);
  assert.match(CHANNEL_TURN_START, /the gate is asked again only if the answer leaves it open, in the same reply/);
});

test("ask: the reply is written before the question; non-work messages get a plain answer", () => {
  const channel = leadInstructions(CHANNEL);
  assert.match(channel, /The text you write before `ask` posts above the question/);
  assert.match(channel, /a plain answer without tools/);
  assert.match(leadInstructions(ANSWER), /The text you write before `ask` posts above the question/);
});

test("failures: every lead turn with tools tells the person plainly and keeps raw errors out of the thread", () => {
  for (const input of [CHANNEL, EVENT, ANSWER]) {
    const text = leadInstructions(input);
    assert.match(text, /# When something fails/);
    assert.match(text, /never raw errors or command output/);
    assert.match(text, /Retry once at most/);
  }
  assert.match(leadInstructions(EVENT), /always one line, with the next step, for a stream that failed or blocked/);
});

test("the build reply says what is running, links the plan and shows progress; the turn ends there", () => {
  const channel = leadInstructions(CHANNEL);
  assert.match(channel, /say what is running — each stream in a few words — link the plan, show progress \(`0 of 2 landed`\)/);
  assert.match(channel, /End there: no question, no consult\./);
});

// ---- Concepts: present, not phrased ----

test("concepts: each lead turn that talks to the person carries the method's ideas", () => {
  const concepts: Record<string, RegExp> = {
    objective: /\bdone\b/i,
    "one artifact through forms": /forms/i,
    snapshots: /snapshot/i,
    attention: /attention/i,
    "trivial change, trivial message": /two-line fix gets a two-line message/,
    "levels of unknowns": /L1[^]*L2[^]*L3/,
    "lazy by default": /almost too long/,
    "build or talk": /spike/,
    parallelism: /independent by files/,
    "fresh contexts": /fresh/i,
    ownership: /the person decides what is built/,
    "git as the truth": /git is the truth/i,
    provenance: /Prompts/,
  };
  for (const input of [BRIEF, CHANNEL, ANSWER]) {
    const text = leadInstructions(input);
    for (const [name, pattern] of Object.entries(concepts)) assert.match(text, pattern, `${input.source}: ${name}`);
  }
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

// ---- Shapes: reference material, fitted to the work ----

test("shapes: no per-stage label list and no line budgets anywhere in the lead text", () => {
  for (const [kind, input] of Object.entries(KINDS)) {
    const text = leadInstructions(input);
    assert.doesNotMatch(text, /~\d+ lines/, `${kind}: no line budget`);
    assert.doesNotMatch(text, /What · Why · In · Out/, `${kind}: no label list`);
    assert.doesNotMatch(text, /Labels of a full message/, `${kind}: no label list`);
  }
});

test("shapes: the register and three examples, reference last, with a trivial example that stays trivial", () => {
  assert.match(SHAPES, /^# Being useful in Slack \(illustration, not a form\)/);
  assert.match(SHAPES, /here to make one decision/);
  assert.match(SHAPES, /A good product manager/);
  assert.match(SHAPES, /\*\*health-alias\*\* · brief · v1/);
  assert.match(SHAPES, /\*\*csv-export-quoting\*\* · brief · v1/);
  assert.match(SHAPES, /\*\*csv-export-quoting\*\* · design · v2/);
  const trivial = SHAPES.slice(SHAPES.indexOf("**health-alias**"));
  const lines = trivial.slice(0, trivial.indexOf("typed replies need an @mention")).split("\n").filter(Boolean);
  assert.ok(lines.length <= 4, `the two-line fix example is ${lines.length} lines`);
  for (const input of [BRIEF, CHANNEL, ANSWER]) {
    const text = leadInstructions(input);
    assert.ok(text.endsWith(SHAPES) || text.endsWith(DOCUMENT_SHAPES), "reference comes last");
  }
  assert.doesNotMatch(guidance(leadInstructions(CHANNEL)), /≤\d+ (content )?lines/, "no line quotas in the guidance");
});

// ---- Size ----

test("size: guidance ≤1 500 words per lead turn kind; with the reference shapes ≤1 900", () => {
  for (const [kind, input] of Object.entries(KINDS)) {
    const text = leadInstructions(input);
    assert.ok(words(guidance(text)) <= 1_500, `${kind}: guidance ${words(guidance(text))} words`); // the opening triage, gate answers, build-start and PR-link rules cost ~150 words
    assert.ok(words(text) <= 1_900, `${kind}: ${words(text)} words`);
  }
});

test("conventions template: templates/conventions.md has its four sections (the lead reads a repo's own file, not a copy)", async () => {
  const template = await readFile(resolve(ROOT, "templates", "conventions.md"), "utf8");
  assert.deepEqual(template.match(/^## .+$/gm), ["## Ship directly", "## Always a plan first", "## Needs a design", "## Building"]);
});
