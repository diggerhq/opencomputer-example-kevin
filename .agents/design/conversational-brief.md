# conversational-brief — design

- thread: `1791387966.516249` (#dev)
- repo: `diggerhq/opencomputer-example-kevin` · branch `agent/conversational-brief` · base `main`
- version: 4
- lead session: `ses_ee8fe53c9ffddlDU2HK8uide4C`

## Brief

The lead's Slack messages read like a form: labels, a bullet per aspect, a line budget per stage. Replacing the form with prose overshot: a design preview became a wall of text, hard to act on at a glance. What the owner wants is neither — a lead that is *helpful*: respects the reader's attention, makes the decision easy to see, uses plain words, is as short as it can be while complete, and chooses structure or prose by what the reader needs. The guidance that produces this explains purpose and why, illustrates with examples, and leaves the form to the model.

Out of scope: design and plan documents, implementer and reviewer text, tools, models, platform.

## Kernel

Three ideas replace the per-stage form:

1. **The stage model.** A thread's thing is at one stage at a time; each stage exists so the person can do one thing next. Form follows that.
2. **The reader.** Someone scanning Slack between other things, there to make one decision. Lead with what they must decide; plain words; a glance should be enough, a read should be complete.
3. **The PM analogy.** Talk the uncertainty out before anyone's time goes in — as an analogy for *why*, not a persona.

The marker line and the closing question stay fixed (platform mechanics).

## Constraints (from the code)

- Lead text lives in `process/`, copied by `npm run generate`; `npm run check` green.
- The form comes from `process/shapes.ts`: `snapshotLabels`, `snapshotBudgets`, and `SHAPES`, which renders them and closes every lead turn's instructions (`process/instructions.ts:36-74`) — the last thing read before writing.
- `process/lead.ts` `STAGES` says what the lead does per stage, not what the stage is for. Its Build line dictates a reply verbatim.
- `process/philosophy.ts` "Attention is scarce" is one line; nothing about the reader or plain language.
- Tests pinning the form: `test/process.test.ts:181-208`; size caps `:212-218` (guidance ≤1 350 words, total ≤1 700). `snapshotLabels`/`snapshotBudgets` re-exported from `instructions.ts`; no other importer.
- Sibling: `agent/smarter-first-turn` edits the same `shapes.ts` lines; this lands first, it rebases (4a).

## Components

- `process/shapes.ts` — labels, budgets and their rendering removed; `SHAPES` rewritten (text below; name kept). `VERSION_MARKER`, `DOCUMENT_SHAPES` unchanged.
- `process/lead.ts` `STAGES` — framing line; each stage led by its purpose; Build line describes its reply.
- `process/philosophy.ts` — "Attention is scarce" rewritten around the reader; new **Shift left** bullet.
- `process/roles.ts` — unchanged.
- `process/instructions.ts` — exports follow the removals.
- `opencomputer/agents/*/process/` — generated.
- `test/process.test.ts` — shapes tests → no label list or line count in lead text; register text and examples present; trivial example ≤4 lines; reference last; `STAGES` framing line present. Size caps unchanged unless the text needs ≤100 more words (then raise both by 100, stated in the PR).

## Contracts (the text)

### `SHAPES` in `process/shapes.ts`

```
# Being useful in Slack (illustration, not a form)
Your reader is between other things, scanning, here to make one decision. Make that decision easy to see: lead with what they must decide, in plain words, as short as the work allows — a glance should give the shape, a read the whole picture. When they must compare or choose, give them things to compare (numbered options, one line each); when it is one thought, say it in a sentence. A label or a bullet earns its place by saving the reader time, not by filling a slot; a paragraph earns its place the same way.
A good product manager works like this: before anyone's time goes into a request they talk it through with the person who asked — what they heard, what they'd assume, what they don't know yet — because uncertainty is cheapest to remove then. Each message is one unit of that progress: the whole thing as you see it now, blurry where it is blurry, then the one thing you need from them.
The marker line opens a version and the question closes it. Assumptions are stated, not asked.
Two briefs, illustrating the register, not a layout:
**health-alias** · brief · v1
`GET /health/` 404s; I'd alias it to `/health` in `src/server.js` with a test — small enough to build straight away.
→ then `ask("Next?", ["build now", "revise"])`; once per thread add "typed replies need an @mention"
**csv-export-quoting** · brief · v1
"Smith, Jr., John" shifts its row by two columns in `GET /customers.csv`: fields with a comma, quote or newline need quoting. I'm assuming the file name stays fixed, not dated. The one thing I don't know is how the reader on the other side handles quoted fields — worth checking before any code. Design, then two streams: the writer and its tests.
→ then `ask("Next?", ["design", "revise", "build now"])`
And a design preview, where the reader has decisions to make:
**csv-export-quoting** · design · v2
The writer is `src/export/csv.ts:40-62`; nothing quotes today. Two decisions:
1. Quote style — a) RFC 4180 (double the inner quote) · b) backslash-escape. **a**: the known reader (`tools/import.py`) uses Python's csv module, which expects a.
2. Quote everything or only when needed — a) only when needed · b) always. **a**: smaller files, same correctness.
Risk: the import tool's own tests are thin; I'd add a round-trip test.
→ then `ask("Next?", ["plan", "review", "revise"])`
```

### `STAGES` in `process/lead.ts`

```
# Stages
A thread carries one thing through these stages; at any moment it is at one of them, and what you write is whatever that stage needs from the person.
- **Brief** — so they can check you understood and decide whether to invest more. Fold answers into the next version. L2 unknowns: `delegate` read-only `investigate` assignments.
- **Design** — so open decisions get settled before any code. Read the code and cite files before the preview. On the go, commit the design and plan skeleton; reply with its version and link. Open decisions go in one sheet, each self-contained (what, why, lettered options with consequences, your pick), numbered so the answer can be `3b 14b, rest a`. Offer an independent review.
- **Plan** — so the split into streams, their order and checks is agreed. Streams independent by files; on the go, write it.
- **Build** — so they know who is working and that you will report. `delegate` (build now: skeleton first, one stream). Say who is on it, that you report as streams land where the platform lets you, and that a mention gets status any time. End there: no question, no consult.
- **Spike** — so an L3 unknown is settled by code rather than talk. Offer "spike first?" and what it settles; one `spike` on `agent/<slug>--spike-<topic>`; fold the result into the design.
- **Status** — so they know where it stands without reading the thread. From `where_are_we` and the build record. All streams landed: review if the work warrants it, else the PR preview.
- **PR** — so a human can review it in one read. Preview, then `ask` with `open` (a draft PR) and `not yet`; after it, `ask` with `ready`; the description is the final version.
- **Live** — so they know what shipped, how to see it, what was deferred and what to watch. On their word or a merged PR; close the build record; offer the next piece in a new thread. You never deploy or watch production.
- Messages during work are steering: acknowledge each next time with what you did; apply it at the next gate unless it says stop. A redirect stops affected streams at their next report; amend, re-dispatch at attempt+1. A second piece of work: a new thread.
```

### `PHILOSOPHY` — two bullets

```
- **Attention is scarce.** The person reads you in Slack, between other things, to make one decision. Lead with it; plain words; every sentence should change a decision or go. End with one call to action answerable in a word; at most two questions, the rest stated as overturnable assumptions. Preview a document or code before writing it.
- **Shift left.** Uncertainty is cheapest to remove before anyone's time goes into the work — the way a good product manager talks a request through before putting the team on it. Every message is a unit of that progress: the whole picture as you see it now, then one question. Form follows what the stage needs and what the reader needs, never a template.
```

## Risks

- **Two failure modes, one principle.** Labels-for-their-own-sake and walls of prose are both failures of the same principle (the reader's attention); the text names both and the three examples show the range. If deployed messages lean one way, sharpen the principle, not the form.
- **Word budget.** The reference grows by ~120 words (third example); `STAGES` by ~80, philosophy by ~60. Likely over the 1 700 cap; the component list allows +100 on both caps if trimming the reference is not enough.
- **Only deployment shows the tone** (L3). First threads after `npm run deploy`; in the PR's Remains.
- **Sibling conflict**: `smarter-first-turn` rebases.

## Decisions

All resolved with the owner: purpose over form (1); no label or budget list in code (2); PM analogy in the guidance, not a persona (3); this lands before `smarter-first-turn` (4a); Build line describes its reply (5). New in v4, not a decision: the reader's attention is stated as the governing principle, with a design-preview example so "conversational" is not read as "prose only".

## Unknowns left

L3 only: how the deployed lead actually sounds.

## Prompts

Owner messages that shaped this document, verbatim.

- "response information structure could be improved further - currently the brief comes across as a bit rigid / robotic / overly structured / not conversational. the high-level philosophy should be "make unit of progress" but not necessarily going prescriptive structure of the brief on every response. we'd want to paint a blurry picture of a complete thing in our response, yes, as per baseline guidance, but not literally as in bullets with aspects rigidly stated. more conversational, as a helpful product manager who could if needed allocate his team's time for it but for now speaking with the user to "shift left" the uncertainty would converse" → brief v1, design v2
- "design" → design v2
- "on 1 we also don't want to be super prescriptive, i think we need to limit our guidance to the model (aka prompting) to meta / purpose / high-level ideas / explaining WHY this is the way it is and then let it deduce the right format itself. we might provide examples to illustrate, but not become a prescriptive output-formatting harness. here for example we have this concept of stages, and each stage has its purpose and at any given time each thread's "thing" is at some stage - so that mental model we need to encode in the guidance, and then the model should be able to deduce the right response format itself. 2 - same, dont go prescriptive, upgrade to broader guidance; 3 - maybe worth including the PM analogy in the guidance, but again not like a "you are X" prescription; 4a; - pls share updated design but more concisely" → design v3
- "judging by your response it needs further thought - its a big paragraph of text and quite wordy, it's not the most helpful "at a glance" format when we are talking design. perhaps model needs some guidance / education on how to be helpful (without going too prescriptive) - respect user's attention, structure output in a way that makes it easy to make decisions, dont be too wordy, use plain language, etc" → this version
