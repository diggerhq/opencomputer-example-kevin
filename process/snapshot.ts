/**
 * The Slack snapshot format (design 019 §4): the version marker, the fixed
 * labels per stage, the line budgets and the layout rules. Labels are bare
 * names; the guidance design §4 puts in parentheses lives in LABEL_HINTS.
 */

// 019 §4 "Stage | Labels"
export const snapshotLabels: Record<string, string[]> = {
  brief: ["What", "Why", "In", "Out", "Unknowns", "Steps", "Questions", "Next"],
  designPreview: ["Kernel", "Constraints", "Components", "Contracts", "Risks", "Decisions", "Unknowns left", "Next"],
  planPreview: ["Streams", "Order", "Checks", "Unknowns left", "Next"],
  status: ["Stage", "Landed", "Running", "Blocked", "Next"],
  review: ["Verdict", "Findings", "Folded", "Next"],
  pr: ["Title", "What / why", "Read first", "Verified", "Remains", "Next"],
  live: ["Shipped", "See it", "Deferred", "Watch", "Next"],
};

// 019 §4 "Budget": brief ≤12; preview ≤15; status ≤10; review ≤12; PR ≤15 (live has none in the design).
export const snapshotBudgets: Record<string, number> = {
  brief: 12,
  designPreview: 15,
  planPreview: 15,
  status: 10,
  review: 12,
  pr: 15,
};

// 019 §4 parentheticals in the labels table
export const LABEL_HINTS: Record<string, string> = {
  "brief.Unknowns": "L1 / L2",
  "brief.Questions": "≤2",
  "designPreview.Decisions": "named, recommended",
  "planPreview.Streams": "name: files, done-when",
  "review.Findings": "severity, one line, your call",
  "pr.Next": "text gate until approval cards reach Workerd",
};

// 019 §4 Line 1; work 040 contracts "Version marker"
export const VERSION_MARKER = "**<slug>** · <stage> · v<n>";

const STAGE_TITLES: Record<string, string> = {
  brief: "Brief",
  designPreview: "Design preview (also the design version after its commit)",
  planPreview: "Plan preview (also the plan version after its commit)",
  status: "Status (build in progress, or \"status?\")",
  review: "Review, design or build (the verdict snapshot)",
  pr: "PR (preview, then the final snapshot = the PR description)",
  live: "Live (the done snapshot)",
};

/** One line per stage: its labels in order, hints in parentheses, and its budget. */
export function labelLines(): string {
  return Object.entries(snapshotLabels)
    .map(([stage, labels]) => {
      const named = labels.map((label) => {
        const hint = LABEL_HINTS[`${stage}.${label}`];
        return hint ? `${label} (${hint})` : label;
      });
      const budget = snapshotBudgets[stage];
      return `  - ${STAGE_TITLES[stage]}: ${named.join(" · ")}${budget ? ` — ≤${budget} lines` : ""}`;
    })
    .join("\n");
}

// 019 §4 "Snapshot format in Slack"; work 040 contracts "Version marker", "Mentions"
export const SNAPSHOT_FORMAT = `# Snapshot format (every version message)
Slack renders your text as standard Markdown (a markdown block): \`**bold**\`, \`-\` bullets, \`---\` rules and code spans work; a single \`*word*\` is italic, never use it for emphasis. Never a table (Slack flattens them). Keep the whole message ≤12 000 chars.
- Line 1, the version marker: \`${VERSION_MARKER}\` (bold slug). A message without it is conversation. n = the higher of your last marker in this thread and \`where_are_we.version\`; a new version is n+1; a "status?" re-post with nothing changed keeps n. When a document commit carries a new version, pass that n to \`commit_document\` so the plan header holds it.
- Then a blank line, then the sections in the stage's order below, a blank line between sections.
- A section is its label in bold on its own line (\`**What**\`) followed by 1–3 bullets, each one line; a section whose content is one short phrase stays on one line (\`**Steps** build now → PR\`). Two short one-line sections may sit on consecutive lines without a blank line between them.
- Then a blank line, \`---\`, and the last line: \`**Next:**\` with the reply words as code spans separated by middle dots, e.g. \`**Next:** \\\`design\\\` · \\\`revise\\\` · \\\`build now\\\`\`, or the one or two questions to answer, each on its own line. Never "see the document".
- Links (only those that exist) go on one line just above the rule: \`branch · design · plan · PR\` as Markdown links.
- Budgets count content lines only (not blank lines or the rule), marker to Next:
${labelLines()}
- A version may cross a stage: the design version is the design preview's labels plus the file's link; the plan version opens with a one-line design summary.
- Nesting: a preview uses the labels of the document it precedes; the design opens with the brief; the plan opens with the design summary; the PR description is the plan grown up.
- Example (brief):
**csv-export-quoting** · brief · v1

**What**
- Quote every field that needs it in \`GET /customers.csv\`; parse what the writer writes; serve the file as a download.

**Why**
- "Smith, Jr., John" shifts its row by two columns today.

**In** diggerhq/opencomputer-fixture-acme-service · \`src/csv.js\`, \`src/server.js\`, tests
**Out** a CSV library · changing the customer shape

**Unknowns**
- L1: should the download name be fixed or dated (assumed fixed, \`customers.csv\`)
- L2: how the current reader handles quotes at all

**Steps** design → plan → build → review → PR; two files, two streams

---
**Next:** \`design\` · \`revise\` · \`build now\` — mention me in replies`;
