import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { CONVENTIONS_TEMPLATE } from "../process/conventions-template";
import {
  implementerInstructions,
  leadInstructions,
  reviewerInstructions,
  snapshotBudgets,
  snapshotLabels,
  VERSION_MARKER,
} from "../process/instructions";

const ROOT = resolve(import.meta.dirname, "..");
const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

test("snapshot labels match design 019 §4", () => {
  assert.deepEqual(snapshotLabels, {
    brief: ["What", "Why", "In", "Out", "Unknowns", "Steps", "Questions", "Next"],
    designPreview: ["Kernel", "Constraints", "Components", "Contracts", "Risks", "Decisions", "Unknowns left", "Next"],
    planPreview: ["Streams", "Order", "Checks", "Unknowns left", "Next"],
    status: ["Stage", "Landed", "Running", "Blocked", "Next"],
    review: ["Verdict", "Findings", "Folded", "Next"],
    pr: ["Title", "What / why", "Read first", "Verified", "Remains", "Next"],
    live: ["Shipped", "See it", "Deferred", "Watch", "Next"],
  });
});

test("snapshot budgets match design 019 §4 (brief 12, previews 15, status 10, review 12, PR 15)", () => {
  assert.deepEqual(snapshotBudgets, { brief: 12, designPreview: 15, planPreview: 15, status: 10, review: 12, pr: 15 });
});

test("the version marker is *<slug>* · <stage> · v<n>", () => {
  assert.equal(VERSION_MARKER, "*<slug>* · <stage> · v<n>");
});

test("brief turn: brief labels, mention line, no where_are_we", () => {
  const text = leadInstructions({ source: "channel", firstTurn: true });
  assert.match(text, /a new thread\. Write the brief/);
  assert.match(text, /\*<slug>\* · brief · v1/);
  assert.match(text, /mention me in replies/);
  assert.match(text, /What · Why · In · Out · Unknowns \(L1 \/ L2\) · Steps · Questions \(≤2\) · Next/);
  assert.doesNotMatch(text, /where_are_we`? before anything/);
  assert.doesNotMatch(text, /`delegate`|`open_pr`|`consult`/);
});

test("later channel turn: where_are_we first, stages, gates, decision sheet, provenance, philosophy", () => {
  const text = leadInstructions({ source: "channel", firstTurn: false });
  assert.match(text, /^You are Kevin's lead/);
  assert.match(text, /Call `where_are_we` before anything else/);
  for (const phrase of [
    "*<slug>* · <stage> · v<n>",
    "decision sheet",
    "`3b 14b, rest a`",
    "reply *open* for a draft PR",
    "\"<N> on it; I'll report as streams land where the platform lets me; mention me any time for status\"",
    "Messages mid-progress",
    "Prompts section",
    "Lazy by default",
    "L1 = known unknowns",
    "Build or talk",
    "Nudge or hold",
    "Parallelism after certainty",
    "one granted → that",
    "spike first?",
  ]) {
    assert.ok(text.includes(phrase), `missing: ${phrase}`);
  }
  assert.ok(text.indexOf("where_are_we") < text.indexOf("# Stages"), "where_are_we comes before the stage logic");
});

test("event turn: record and merge only; never open_pr, never consult", () => {
  const text = leadInstructions({ source: "event", firstTurn: false });
  assert.match(text, /delivered outcome from an implementer/);
  assert.match(text, /Never `open_pr`, never `consult`, never a question/);
  assert.match(text, /`git status --porcelain`/);
  assert.match(text, /`integrate`/);
  assert.match(text, /one line only if/);
  assert.doesNotMatch(text, /# Consulting the reviewer/);
});

test("consult-answer turn: held messages first, judgement, one rebuttal", () => {
  const text = leadInstructions({ source: "subagent", firstTurn: false });
  assert.ok(text.indexOf("Held messages first") < text.indexOf("Judge every finding"));
  assert.match(text, /skip the first line `Agent <id> answered:`/);
  assert.match(text, /folded, declined \(with the reason\) or deferred/);
  assert.match(text, /One rebuttal/);
  assert.match(text, /reviewer unavailable/);
});

test("lead instructions stay under ~2 500 words per turn kind", () => {
  for (const source of ["channel", "event", "subagent"] as const) {
    for (const firstTurn of [true, false]) {
      const count = words(leadInstructions({ source, firstTurn }));
      assert.ok(count <= 2_600, `${source}/${firstTurn}: ${count} words`);
    }
  }
});

test("implementer: branch discipline, shell only, fenced JSON report keys", () => {
  const text = implementerInstructions();
  assert.match(text, /^You are one of Kevin's implementers/);
  assert.match(text, /`agent\/<slug>--<stream>`/);
  assert.match(text, /Shell only/);
  assert.match(text, /Never merge/);
  assert.match(text, /never write documents/);
  assert.match(text, /```json\n\{ "landed": \[\{ "sha", "subject" \}\], "checks": \{ "status": "pass" \| "fail", "tail" \}, "blocked": \[\], "planAmendments": \[\] \}\n```/);
  assert.match(text, /`investigate`: read-only/);
  assert.match(text, /`spike`: .*throwaway branch/);
});

test("reviewer: consult brief, read-only, 10-minute budget, Prompts rule, fenced JSON report keys", () => {
  const text = reviewerInstructions();
  assert.match(text, /^You are Kevin's reviewer/);
  assert.match(text, /`kind: "consult"`/);
  assert.match(text, /You never write/);
  assert.match(text, /≤10 minutes/);
  assert.match(text, /Run nothing/);
  assert.match(text, /Prompts section is provenance, not specification/);
  assert.match(
    text,
    /```json\n\{ "verdict": "ship" \| "fix-first", "findings": \[\{ "id", "severity", "file"\?, "line"\?, "scenario", "change" \}\] \}\n```/,
  );
  assert.match(text, /ranked by severity/);
});

test("conventions template: identical to templates/conventions.md, four sections", async () => {
  assert.equal(CONVENTIONS_TEMPLATE, await readFile(resolve(ROOT, "templates", "conventions.md"), "utf8"));
  assert.deepEqual(
    CONVENTIONS_TEMPLATE.match(/^## .+$/gm),
    ["## Ship directly", "## Always a plan first", "## Needs a design", "## Building"],
  );
});
