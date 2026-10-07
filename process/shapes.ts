/**
 * Shapes that have worked: message labels and sizes per stage, the version
 * marker, two examples, and the sections of the documents. Reference
 * material the model fits to the work (design 019 §2 "Guidance, not a
 * harness"; §4 "Snapshot format in Slack"; §6 shapes). The only hard rule
 * here is the marker line itself, stated in lead.ts MECHANICS.
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

// 019 §4 "Size": calibration for a full message, not a quota (live has none in the design)
export const snapshotBudgets: Record<string, number> = {
  brief: 12,
  designPreview: 15,
  planPreview: 15,
  status: 10,
  review: 12,
  pr: 15,
};

// 019 §4 Line 1; work 040 contracts "Version marker"
export const VERSION_MARKER = "**<slug>** · <stage> · v<n>";

const STAGE_NAMES: Record<string, string> = {
  brief: "Brief",
  designPreview: "Design preview / design",
  planPreview: "Plan preview / plan",
  status: "Status",
  review: "Review verdict",
  pr: "PR",
  live: "Live",
};

/** One line per stage: the labels that carried a full message, and its size at most. */
function labelLines(): string {
  return Object.entries(snapshotLabels)
    .map(([stage, labels]) => {
      const budget = snapshotBudgets[stage];
      const named = labels.filter((label) => label !== "Next").join(" · ");
      return `  - ${STAGE_NAMES[stage]}: ${named}${budget ? ` (~${budget} lines)` : ""}`;
    })
    .join("\n");
}

// 019 §4 "Snapshot format in Slack", "Nesting"
export const SHAPES = `# Shapes that work (reference, not a form)
These have read well in Slack; fit them to the work and drop what carries nothing. A trivial change gets a trivial message.
- Layout: the marker; bold labels with one-line bullets (a one-phrase section on one line); the links that exist (branch · design · plan · PR); then \`ask\` with the options.
- Labels of a full message (a preview uses its document's labels; the PR description is the plan grown up):
${labelLines()}
- A two-line fix, the whole brief:
**health-alias** · brief · v1
\`GET /health/\` 404s; alias it to \`/health\` in \`src/server.js\`, with a test.
---
→ then \`ask("Next?", ["build now", "revise"])\`; once per thread add "typed replies need an @mention"
- A feature brief:
**csv-export-quoting** · brief · v1

**What** quote fields that need it in \`GET /customers.csv\`
**Why** "Smith, Jr., John" shifts its row by two columns
**Unknowns** L1: file name fixed or dated (assumed fixed) · L2: how the reader handles quotes
**Steps** design → plan → build → review → PR; two streams

---
→ then \`ask("Next?", ["design", "revise", "build now"])\``;

// 019 §6 design, plan and PR shapes; §10 Prompts; work 040 "Plan state"
export const DOCUMENT_SHAPES = `# Documents (reference)
- Design, a time-unaware whole: the brief; kernel; constraints; components, boundaries, contracts (every field) and interactions; risks; numbered decisions with recommendations; Prompts.
- Plan, where time enters: header (thread, your session id, repo, branch, base, \`version:\`); \`kevin-state\`; design summary; code map; streams (files, checks, done-when, depends-on); order; verification; how to resume; build record; Prompts.
- PR description, one read for a human: what and why, decisions and risks, read first, verification, what remains, links.`;
