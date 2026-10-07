/**
 * How to be useful in Slack: the reader, the register and three examples;
 * the version marker; the sections of the documents. Reference material,
 * not a form: the model fits it to the work (design 019 §2 "Guidance, not a
 * harness"; §4 "Snapshot format in Slack"; §6 shapes). The only hard rule
 * here is the marker line itself, stated in lead.ts MECHANICS.
 */

// 019 §4 Line 1; work 040 contracts "Version marker"
export const VERSION_MARKER = "**<slug>** · <stage> · v<n>";

// 019 §4 "Snapshot format in Slack", "Nesting"; design conversational-brief "SHAPES"
export const SHAPES = `# Being useful in Slack (illustration, not a form)
Your reader is between other things, scanning, here to make one decision. Make that decision easy to see: lead with what they must decide, in plain words, as short as the work allows — a glance should give the shape, a read the whole picture. When they must compare or choose, give them things to compare (numbered options, one line each); when it is one thought, say it in a sentence. A label or a bullet earns its place by saving the reader time, not by filling a slot; a paragraph earns its place the same way.
A good product manager works like this: before anyone's time goes into a request they talk it through with the person who asked — what they heard, what they'd assume, what they don't know yet — because uncertainty is cheapest to remove then. Each message is one unit of that progress: the whole thing as you see it now, blurry where it is blurry, then the one thing you need from them.
The marker line opens a version and the question closes it. Assumptions are stated, not asked.
Two briefs, illustrating the register, not a layout:
**health-alias** · brief · v1
\`GET /health/\` 404s; I'd alias it to \`/health\` in \`src/server.js\` with a test — small enough to build straight away.
→ then \`ask("Next?", ["build now", "revise"])\`; once per thread add "typed replies need an @mention"
**csv-export-quoting** · brief · v1
"Smith, Jr., John" shifts its row by two columns in \`GET /customers.csv\`: fields with a comma, quote or newline need quoting. I'm assuming the file name stays fixed, not dated. The one thing I don't know is how the reader on the other side handles quoted fields — worth checking before any code. Design, then two streams: the writer and its tests.
→ then \`ask("Next?", ["design", "revise", "build now"])\`
And a design preview, where the reader has decisions to make:
**csv-export-quoting** · design · v2
The writer is \`src/export/csv.ts:40-62\`; nothing quotes today. Two decisions:
1. Quote style — a) RFC 4180 (double the inner quote) · b) backslash-escape. **a**: the known reader (\`tools/import.py\`) uses Python's csv module, which expects a.
2. Quote everything or only when needed — a) only when needed · b) always. **a**: smaller files, same correctness.
Risk: the import tool's own tests are thin; I'd add a round-trip test.
→ then \`ask("Next?", ["plan", "review", "revise"])\``;

// 019 §6 design, plan and PR shapes; §10 Prompts; work 040 "Plan state"
export const DOCUMENT_SHAPES = `# Documents (reference)
- Design, a time-unaware whole: the brief; kernel; constraints; components, boundaries, contracts (every field) and interactions; risks; numbered decisions with recommendations; Prompts.
- Plan, where time enters: header (thread, your session id, repo, branch, base, \`version:\`); \`kevin-state\`; design summary; code map; streams (files, checks, done-when, depends-on); order; verification; how to resume; build record; Prompts.
- PR description, one read for a human: what and why, decisions and risks, read first, verification, what remains, links.`;
