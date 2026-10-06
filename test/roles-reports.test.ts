import assert from "node:assert/strict";
import test from "node:test";

import { implementerInstructions, reviewerInstructions } from "../process/instructions";
import { IMPLEMENTER_REPORT_SHAPE, REVIEWER_REPORT_SHAPE } from "../process/reports";
import { firstFencedJson, isImplementerReport, isReviewerReport } from "./roles-shapes";

/** Top-level keys a process shape names (`{ "a": …, "b": … }`), read from the text the agents are given. */
const topLevelKeys = (shape: string) => {
  const keys: string[] = [];
  let depth = 0;
  for (const match of shape.matchAll(/[{}[\]]|"(\w+)"(?=\??\s*[:,}])/g)) {
    if (match[0] === "{" || match[0] === "[") depth++;
    else if (match[0] === "}" || match[0] === "]") depth--;
    else if (depth === 1 && match[1]) keys.push(match[1]);
  }
  return keys;
};

test("the process text gives each role the report shape in a fenced json block", () => {
  assert.equal(firstFencedJson(implementerInstructions()), IMPLEMENTER_REPORT_SHAPE);
  assert.equal(firstFencedJson(reviewerInstructions()), REVIEWER_REPORT_SHAPE);
  assert.deepEqual(topLevelKeys(IMPLEMENTER_REPORT_SHAPE), ["landed", "checks", "blocked", "planAmendments"]);
  assert.deepEqual(topLevelKeys(REVIEWER_REPORT_SHAPE), ["verdict", "findings"]);
});

// Authored final messages, each following the process text: prose may come
// before the block; the block is the report; nothing after it.
const IMPLEMENTER_REPORTS = {
  build: [
    "Stream api done.",
    "```json",
    JSON.stringify({
      landed: [
        { sha: "4e1f9a2", subject: "Add CSV export endpoint for orders" },
        { sha: "9b03c7d", subject: "Quote fields containing commas and quotes" },
      ],
      checks: { status: "pass", tail: "# tests 42\n# pass 42\n# fail 0" },
      blocked: [],
      planAmendments: ["design §Contracts says ISO dates; src/orders/model.ts:31 stores epoch ms, converted at export"],
    }),
    "```",
  ].join("\n"),
  blocked: [
    "```json",
    JSON.stringify({
      landed: [],
      checks: { status: "fail", tail: "npm ERR! missing script: test" },
      blocked: ["the repo has no test script; the assignment's checks cannot run (package.json:5)"],
      planAmendments: [],
    }),
    "```",
  ].join("\n"),
  // process/implementer.ts "Kinds": investigate → landed empty, checks { "status": "pass", "tail": "" }
  investigate: (() => {
    const checks = /`checks` is `(\{ "status": "pass", "tail": "" \})`/.exec(implementerInstructions())?.[1];
    assert.ok(checks, "the investigate checks literal is in the process text");
    return [
      "```json",
      `{ "landed": [], "checks": ${checks}, "blocked": [], "planAmendments": ["personal data: email at src/orders/model.ts:14, address at src/orders/model.ts:18"] }`,
      "```",
    ].join("\n");
  })(),
};

for (const [name, message] of Object.entries(IMPLEMENTER_REPORTS)) {
  test(`implementer report (${name}) parses as the report shape from the first fenced block`, () => {
    const block = firstFencedJson(message);
    assert.ok(block);
    assert.ok(isImplementerReport(JSON.parse(block)));
  });
}

test("implementer report: a wrong shape does not pass (the lead treats it as blocked)", () => {
  for (const bad of [
    { landed: [{ sha: "4e1f9a2" }], checks: { status: "pass", tail: "" }, blocked: [], planAmendments: [] },
    { landed: [], checks: { status: "green", tail: "" }, blocked: [], planAmendments: [] },
    { landed: [], checks: { status: "pass", tail: "" }, blocked: [] },
    { landed: [], checks: { status: "pass", tail: "" }, blocked: [], planAmendments: [], findings: [] },
  ]) {
    assert.equal(isImplementerReport(bad), false, JSON.stringify(bad));
  }
});

// The consult answer as the lead receives it: the platform's wrapper line, then the reviewer's final message.
const answered = (body: string) => `Agent kevin--reviewer answered:\n${body}`;

test("reviewer report (fix-first) parses after the wrapper line", () => {
  const report = {
    verdict: "fix-first",
    findings: [
      {
        id: "F1",
        severity: "high",
        file: "src/orders/export.ts",
        line: 27,
        scenario: "An order note containing a newline splits one row into two; the import on the other side drops the order.",
        change: "Quote any field containing CR or LF, not only commas.",
      },
      { id: "F2", severity: "low", scenario: "The design's Risks section does not name the export size.", change: "Name the expected upper bound." },
    ],
  };
  const block = firstFencedJson(answered(["```json", JSON.stringify(report, null, 2), "```"].join("\n")));
  assert.ok(block);
  assert.ok(isReviewerReport(JSON.parse(block)));
});

test("reviewer report (ship, no findings) parses", () => {
  const block = firstFencedJson(answered('```json\n{ "verdict": "ship", "findings": [] }\n```'));
  assert.ok(block);
  assert.ok(isReviewerReport(JSON.parse(block)));
});

test("reviewer report: verdict must follow the severities (fix-first iff any high)", () => {
  const finding = { id: "F1", severity: "high", scenario: "s", change: "c" };
  assert.equal(isReviewerReport({ verdict: "ship", findings: [finding] }), false);
  assert.equal(isReviewerReport({ verdict: "fix-first", findings: [{ ...finding, severity: "medium" }] }), false);
  assert.equal(isReviewerReport({ verdict: "fix-first", findings: [{ ...finding, severity: "critical" }] }), false);
});
