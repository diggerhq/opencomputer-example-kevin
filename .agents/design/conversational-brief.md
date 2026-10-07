# conversational-brief — design

- thread: `1791387966.516249` (#dev)
- repo: `diggerhq/opencomputer-example-kevin` · branch `agent/conversational-brief` · base `main`
- version: 2
- lead session: `ses_ee8fe53c9ffddlDU2HK8uide4C`

## Brief

The lead's messages in Slack — the brief most visibly, but every stage — read like a form being filled in: bold labels, one bullet per aspect, a fixed line budget. The owner wants them to read like a product manager thinking out loud with the person: someone who could put the team on the work tomorrow but is talking first, to take the uncertainty out while it is cheap. The substance stays — one unit of progress per message, a blurry but complete picture of the whole thing, one question at the end — but the labels and bullet scaffolding become the exception rather than the default.

Out of scope: the design and plan *documents* (read later, cold, by people who missed the thread; structure helps there), the implementer and reviewer text, tools, models, the platform.

## Kernel

Replace "labels and sizes per stage" with a **voice**: prose by default, structure only where the content is genuinely a list. The marker line still opens a version and the `ask` gate still closes it; between them the lead speaks in sentences. What a full picture must *cover* is kept as a coverage list the model reads, not as headings it renders.

## Constraints (from the code)

- All of the lead's text lives in `process/` (single source) and is copied into `opencomputer/agents/*/process/` by `npm run generate`; `npm run check` (`generate --check` + typecheck + tests + doctor) must be green. Edit the source, never the copies.
- `process/shapes.ts` is where the form comes from: `snapshotLabels` (per stage: What · Why · In · Out · Unknowns · Steps · Questions …), `snapshotBudgets` (12/15/15/10/12/15 lines), and `SHAPES`, which renders them as "Labels of a full message" plus a layout line that says "bold labels with one-line bullets". Both examples in `SHAPES` are label-and-bullet briefs. This block closes every lead turn's instructions (`process/instructions.ts:36-74`), so it is the last thing the model reads before writing.
- `process/philosophy.ts` already carries the right ideas ("Snapshots": a version is the whole artifact readable by someone who missed everything; "Attention is scarce": size follows the work, one call to action) — but says nothing about *voice*, so the reference shapes win.
- `process/lead.ts` `BRIEF_TURN` lists the brief's content ("what you understood, what you assume, what is unknown, which steps") — content, not form; fine. `STAGES` fixes one reply verbatim ("<N> on it; I'll report as streams land…") and describes the decision sheet as numbered and lettered — the sheet is a genuine list and stays.
- `process/roles.ts` `ROLES.lead` is one sentence about duties; it says nothing about how the lead talks.
- Tests pin the current form: `test/process.test.ts:181-195` deep-equals `snapshotLabels` and `snapshotBudgets` and asserts every label string appears in `SHAPES`; `:197-208` asserts "reference, not a form", "fit them to the work", "A trivial change gets a trivial message", that the two-line example stays ≤4 lines, that the reference comes last, and that the guidance has no line quotas; `:212-218` caps guidance at ~1 350 words and the whole text at 1 700 per turn kind. The new text must fit the same budget.
- `snapshotLabels`, `snapshotBudgets`, `VERSION_MARKER` are re-exported from `process/instructions.ts`; nothing outside `test/process.test.ts` imports the first two.
- **Sibling work in flight**: `agent/smarter-first-turn` (design v2, no code yet, no PR) changes the opening turn to triage *and* shrinks the brief to 8 lines with labels What · Why · Unknowns · Steps (its decision 3, `shapes.ts` brief labels/budget/brevity rule). That part is superseded by this design; the triage part is untouched here. Both touch `process/shapes.ts` and `test/process.test.ts`, so whichever lands second rebases.

## Components

- **Voice reference** — `process/shapes.ts`: `SHAPES` becomes `VOICE` (export kept under `SHAPES` too, so `instructions.ts` and the tests' "reference comes last" check need no rename); `snapshotLabels` becomes `snapshotAspects` — the same aspects, lower-cased, read as a coverage list; `snapshotBudgets` deleted. The two examples rewritten in prose. `VERSION_MARKER` unchanged. `DOCUMENT_SHAPES` unchanged.
- **Philosophy** — `process/philosophy.ts`: one new bullet, **Voice**, naming the PM stance and "one unit of progress per message"; "Attention is scarce" loses "size follows the work, so a two-line fix gets a two-line message" (it moves to the voice reference) and keeps the one-call-to-action rule.
- **Role line** — `process/roles.ts` `ROLES.lead`: one clause added about how the lead talks.
- **Stages** — `process/lead.ts` `STAGES` Build line: the verbatim reply becomes a description of what the reply says. Nothing else in `lead.ts` changes (`BRIEF_TURN` already lists content, not form; if `agent/smarter-first-turn` lands first its `OPENING_TURN` is equally compatible).
- **Generated copies** — `opencomputer/agents/{lead,implementer,reviewer}/process/*` via `npm run generate`.
- **Tests** — `test/process.test.ts`: the labels/budgets test becomes an aspects test (each stage's aspects named in `VOICE`, no budgets); the "reference to fit" test asserts the voice statements instead of the layout line, keeps "reference comes last", "no line quotas", the ≤4-line trivial example; the size test unchanged. `test/lead-render.test.ts`: unchanged unless the render test greps a phrase that moved (none found).
- **README** — `README.md` "Method and voice" already says the process text is voice; no change.

## Contracts (the text)

### `VOICE` in `process/shapes.ts` (replaces `SHAPES`; the `snapshotAspects` sentence is rendered from the map)

```
# Voice (reference, not a form)
You write like a product manager who could put the team on this tomorrow but is talking first, to take the uncertainty out while it is cheap. A message is one unit of progress: it paints the whole thing as you see it now, blurry where it is blurry, and ends with the one thing you need from the person.
- Prose first. Say it as you would to a colleague — what you understood, what you would assume, what you are unsure of, what you would do next — in sentences and short paragraphs. Bold labels and bullets only where the content really is a list: lettered decisions, streams, findings, the links.
- Size follows the work: a two-line fix gets two sentences, a feature two or three short paragraphs; never a form with every aspect filled in.
- The marker line opens a version and the question closes it; between them no preamble that restates the message and no sign-off. Assumptions are stated as assumptions the person can overturn, not asked.
- A full picture still covers, in the flow of the text rather than as headings: a brief — what, why, assumptions, unknowns, steps; a design preview — kernel, constraints, components and contracts, risks, decisions; a plan — streams, order, checks; status — landed, running, blocked; a review — verdict, findings, what you folded; a PR — what and why, read first, verified, what remains; live — shipped, how to see it, deferred, what to watch.
- A two-line fix, the whole brief:
**health-alias** · brief · v1
`GET /health/` 404s; I'd alias it to `/health` in `src/server.js` with a test — small enough to build straight away.
→ then `ask("Next?", ["build now", "revise"])`; once per thread add "typed replies need an @mention"
- A feature brief:
**csv-export-quoting** · brief · v1
"Smith, Jr., John" shifts its row by two columns in `GET /customers.csv`, so the export needs to quote fields that carry a comma, a quote or a newline. I'm assuming the file name stays fixed rather than dated, and before touching anything I'd want to see how the reader on the other side handles quoted fields — that's the one thing I don't know yet. Design first, then two streams: the writer and its tests.
→ then `ask("Next?", ["design", "revise", "build now"])`
```

### `snapshotAspects` (replaces `snapshotLabels`; `snapshotBudgets` removed)

```ts
export const snapshotAspects: Record<string, string[]> = {
  brief: ["what", "why", "assumptions", "unknowns", "steps"],
  designPreview: ["kernel", "constraints", "components and contracts", "risks", "decisions"],
  planPreview: ["streams", "order", "checks"],
  status: ["landed", "running", "blocked"],
  review: ["verdict", "findings", "what you folded"],
  pr: ["what and why", "read first", "verified", "what remains"],
  live: ["shipped", "how to see it", "deferred", "what to watch"],
};
```

### `PHILOSOPHY` — new bullet after "Snapshots", and the trimmed "Attention is scarce"

```
- **Voice.** You are the product manager on this, not a form: you talk the uncertainty out of the work before anyone's time goes into it, and every message is one unit of progress toward it — the whole picture as you see it now, then one question.
- **Attention is scarce.** Every sentence should change a decision. End with one call to action answerable in a word; at most two questions, the rest stated as overturnable assumptions. Preview a document or code before writing it.
```

### `ROLES.lead`

```
You are Kevin's lead: you talk to the person as a product manager would, write the brief, design and plan, delegate, integrate, judge reviews and write the PR description. You never write product code.
```

### `STAGES` · Build line

```
- **Build.** `delegate` (build now: skeleton first, one stream). Say who is on it, that you'll report as streams land where the platform lets you, and that a mention gets status any time. End there: no question, no consult.
```

## Risks

- **Drift to chat.** Without labels the model may chat and drop an aspect the person needed. Mitigated by the coverage sentence (rendered from `snapshotAspects`, so it cannot silently fall out of the text), the marker/question rule, and the two prose examples that visibly cover every aspect.
- **Word budget.** The voice block is a little longer than the shapes block it replaces; the philosophy bullet adds ~50 words. The size test (≤1 700 words with reference) is the guard; the implementer trims the voice text, never the mechanics, if it fails.
- **Only deployment shows the tone.** Whether the lead actually sounds like this is an L3 unknown: it is visible on the first threads after `npm run deploy`, not in `npm run check`. The two examples in `VOICE` are the best stand-in; the PR's "Remains" asks for a look at the first three briefs after deploy.
- **Sibling conflict.** `agent/smarter-first-turn` edits the same `shapes.ts` lines and the same test. Second to land rebases; its brief-size decision no longer applies once this is in.

## Decisions

1. **Where structure survives** — a) prose everywhere, decisions included · b) prose by default; lists for lettered decisions, streams, findings, links; documents unchanged · c) prose for the brief only, other stages keep labels. **Pick b**: the owner said every response; a decision sheet answered with `3b 14b, rest a` needs its numbers.
2. **Labels and budgets in code** — a) delete both and the test · b) keep the aspects as a lower-cased coverage list rendered into the voice text as one sentence; delete the budgets · c) keep both as is, soften only the wording. **Pick b**: the aspects are what keeps "blurry but complete" complete, and rendering them keeps text and test in step; the budgets are exactly the rigidity being removed.
3. **The role line** — a) add "as a product manager would" to `ROLES.lead` · b) leave roles as pure duty lists, voice in the reference only. **Pick a**: it is the first sentence of every turn and the only one read before the turn-specific rules.
4. **Order against `smarter-first-turn`** — a) this lands first; that thread drops its brief-size change (decision 3) and rebases its triage change · b) that lands first; this rebases over it · c) fold both into one branch. **Pick a** as an assumption: this one is smaller and supersedes the brief-size part; the triage change is independent. Say the word and I'll hold instead.
5. **Build line wording** — a) describe the reply instead of dictating it · b) keep the verbatim sentence. **Pick a**: the one dictated sentence in the stages reads as the form the owner is describing.

## Unknowns left

L1: decisions 1–5. L2: none — the process text, its render and its tests are read. L3: how the deployed lead actually sounds; checked on the first threads after deploy.

## Prompts

Owner messages that shaped this document, verbatim.

- "response information structure could be improved further - currently the brief comes across as a bit rigid / robotic / overly structured / not conversational. the high-level philosophy should be "make unit of progress" but not necessarily going prescriptive structure of the brief on every response. we'd want to paint a blurry picture of a complete thing in our response, yes, as per baseline guidance, but not literally as in bullets with aspects rigidly stated. more conversational, as a helpful product manager who could if needed allocate his team's time for it but for now speaking with the user to "shift left" the uncertainty would converse" → brief v1, this document
- "design" → this document
