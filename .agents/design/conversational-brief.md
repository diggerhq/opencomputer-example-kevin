# conversational-brief — design

- thread: `1791387966.516249` (#dev)
- repo: `diggerhq/opencomputer-example-kevin` · branch `agent/conversational-brief` · base `main`
- version: 3
- lead session: `ses_ee8fe53c9ffddlDU2HK8uide4C`

## Brief

The lead's Slack messages read like a form: bold labels, one bullet per aspect, a line budget per stage. The owner wants them to read like a good product manager talking a request through with the person before anyone's time goes into it — one unit of progress per message, the whole thing as currently understood, blurry where it is blurry, one question at the end. And the guidance that produces this must itself not be a formatting harness: it explains purpose and why, illustrates with examples, and lets the model deduce the form.

Out of scope: design and plan documents (read cold, structure helps), implementer and reviewer text, tools, models, platform.

## Kernel

Replace *prescribed form* with *explained purpose*. The mental model the guidance encodes: a thread carries one thing through stages; at any moment it is at one of them; each stage exists so the person can do one specific thing next. The message's form follows from what that stage is for — the model works it out. The marker line and the closing question remain the only fixed elements (they are platform mechanics: version detection and the gate).

## Constraints (from the code)

- Lead text lives in `process/` (single source), copied to `opencomputer/agents/*/process/` by `npm run generate`; `npm run check` must be green.
- The form comes from `process/shapes.ts`: `snapshotLabels` (per-stage label lists), `snapshotBudgets` (line counts), and `SHAPES`, which renders both and says "bold labels with one-line bullets"; its two examples are label-and-bullet briefs. `SHAPES` closes every lead turn's instructions (`process/instructions.ts:36-74`), so it is the last thing read before writing.
- `process/lead.ts` `STAGES` describes each stage by what the lead *does* ("Fold answers…", "Read the code…"), not by what it is *for* — so the purpose the model would need to deduce the form is not there. The Build line dictates one reply verbatim.
- `process/philosophy.ts` carries the right ideas (Snapshots, Attention is scarce) but nothing about register or shift-left.
- Tests pinning the form: `test/process.test.ts:181-208` (deep-equal of labels/budgets, label strings present in `SHAPES`, "reference, not a form", trivial example ≤4 lines, reference last, no line quotas), `:212-218` (guidance ≤1 350 words, total ≤1 700 per turn kind). `snapshotLabels`/`snapshotBudgets` are re-exported from `instructions.ts`; nothing else imports them.
- Sibling in flight: `agent/smarter-first-turn` (design v2, no code) also edits `shapes.ts` brief labels/budget. Decision 4: this lands first; that thread drops its brief-size change and rebases its triage change.

## Components

- `process/shapes.ts` — `snapshotLabels`, `snapshotBudgets` and the label rendering removed; `SHAPES` rewritten as the register text below (name kept so `instructions.ts` and the "reference last" test need no change). `VERSION_MARKER`, `DOCUMENT_SHAPES` unchanged.
- `process/lead.ts` `STAGES` — a framing line, then each stage led by its purpose (what the person can do after reading it); the Build line describes its reply instead of dictating it.
- `process/philosophy.ts` — one bullet, **Shift left**, carrying the PM analogy as an analogy and "form follows the stage".
- `process/roles.ts` — unchanged (decision 3: the analogy lives in the guidance, not in "you are X").
- `process/instructions.ts` — exports follow the removals.
- `opencomputer/agents/*/process/` — `npm run generate`.
- `test/process.test.ts` — the two shapes tests become: no per-stage label list or line count in the lead text; the register text and both examples present; trivial example ≤4 lines; reference last; `STAGES` opens with the framing line and every stage line names its purpose. Size test unchanged.

## Contracts (the text)

### `SHAPES` in `process/shapes.ts`

```
# Register (illustration, not a form)
A good product manager, handed a request, does not schedule it; they talk it through with the person first — what they heard, what they would assume, what they do not know yet, what they would do — because uncertainty is cheapest to remove before the work starts. That is the register. Each message is one unit of progress: the whole thing as you see it now, blurry where it is blurry, then the one thing you need from the person.
- Form follows the stage. Each stage exists so the person can do one thing next; write whatever lets them do it fastest. Usually that is a few sentences; sometimes a numbered list, because they must answer item by item; rarely a label. A form filled in for its own sake is noise, and so is restating their message back to them.
- The marker line opens a version and the question closes it. Assumptions are stated, not asked.
- Two briefs, to illustrate the register, not a layout:
**health-alias** · brief · v1
`GET /health/` 404s; I'd alias it to `/health` in `src/server.js` with a test — small enough to build straight away.
→ then `ask("Next?", ["build now", "revise"])`; once per thread add "typed replies need an @mention"
**csv-export-quoting** · brief · v1
"Smith, Jr., John" shifts its row by two columns in `GET /customers.csv`, so the export needs to quote fields that carry a comma, a quote or a newline. I'm assuming the file name stays fixed rather than dated, and before touching anything I'd want to see how the reader on the other side handles quoted fields — that's the one thing I don't know yet. Design first, then two streams: the writer and its tests.
→ then `ask("Next?", ["design", "revise", "build now"])`
```

### `STAGES` in `process/lead.ts` (purpose first; mechanics kept)

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

### `PHILOSOPHY` — new bullet after "Snapshots"

```
- **Shift left.** Uncertainty is cheapest to remove before anyone's time goes into the work — the way a good product manager talks a request through before putting the team on it. Every message is a unit of progress toward that: the whole picture as you see it now, then one question. Form follows what the stage needs, never a template.
```

## Risks

- **Completeness now rests on purpose, not a checklist.** A brief might miss an aspect the labels used to force. Accepted by design: the stage purposes and the two examples carry it; if deployed briefs drop something consistently, the fix is a sharper purpose line, not a label.
- **Word budget.** `STAGES` grows by ~80 words, philosophy by ~60, the register block is roughly the size of what it replaces; the ≤1 700 cap is the guard. The implementer trims the register text first, never the mechanics.
- **Only deployment shows the tone** (L3). Checked on the first threads after `npm run deploy`; named in the PR's "Remains".
- **Sibling conflict** on `shapes.ts` and `test/process.test.ts`: `smarter-first-turn` rebases.

## Decisions

1. **Form** — explained purpose per stage, the model deduces the form; no list of where structure is allowed. *Resolved with the owner.*
2. **Labels and budgets in code** — removed, no replacement list; the stage purposes carry completeness. *Resolved.*
3. **PM analogy** — in the guidance as an analogy (philosophy bullet, register text); `ROLES.lead` unchanged. *Resolved.*
4. **Order against `smarter-first-turn`** — this lands first; that thread drops its brief-size change and rebases. *Resolved: 4a.*
5. **Build line** — describes its reply instead of dictating it. *Resolved.*

## Unknowns left

L3 only: how the deployed lead actually sounds.

## Prompts

Owner messages that shaped this document, verbatim.

- "response information structure could be improved further - currently the brief comes across as a bit rigid / robotic / overly structured / not conversational. the high-level philosophy should be "make unit of progress" but not necessarily going prescriptive structure of the brief on every response. we'd want to paint a blurry picture of a complete thing in our response, yes, as per baseline guidance, but not literally as in bullets with aspects rigidly stated. more conversational, as a helpful product manager who could if needed allocate his team's time for it but for now speaking with the user to "shift left" the uncertainty would converse" → brief v1, design v2
- "design" → design v2
- "on 1 we also don't want to be super prescriptive, i think we need to limit our guidance to the model (aka prompting) to meta / purpose / high-level ideas / explaining WHY this is the way it is and then let it deduce the right format itself. we might provide examples to illustrate, but not become a prescriptive output-formatting harness. here for example we have this concept of stages, and each stage has its purpose and at any given time each thread's "thing" is at some stage - so that mental model we need to encode in the guidance, and then the model should be able to deduce the right response format itself. 2 - same, dont go prescriptive, upgrade to broader guidance; 3 - maybe worth including the PM analogy in the guidance, but again not like a "you are X" prescription; 4a; - pls share updated design but more concisely" → this version
