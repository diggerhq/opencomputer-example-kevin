# conversational-brief — design

- thread: `1791387966.516249` (#dev)
- repo: `diggerhq/opencomputer-example-kevin` · branch `agent/conversational-brief` · base `main` (merged at `a3c6a7a`, K33)
- version: 5
- lead session: `ses_ee8fe53c9ffddlDU2HK8uide4C`

## Brief

The lead's Slack messages read like a form: labels, a bullet per aspect, a line budget per stage. Pure prose overshot (v3): a wall of text, hard to act on at a glance. What the owner wants is a lead that is *helpful* — respects the reader's attention, makes the decision easy to see, plain words, as short as it can be while complete, structure or prose by what the reader needs — and guidance that explains purpose and why, illustrates with examples, and leaves the form to the model.

v5 folds four related, unbuilt threads into the same change, since all of them are the lead's text and ship in one deploy:

- **smarter-first-turn** — the opening turn triages (answer · brief · one question) and may run one read-only lookup for a question about Kevin itself.
- **fluid-gates** — a typed question at a gate gets a real answer, not a re-asked gate.
- **build-start-ux** — the build-start message says what is running, links the plan, shows progress.
- **pr-link-in-reply** — never imply a PR exists before `open_pr` returns its link.

And the `ask` mechanics are updated to how Slack questions work now (a question no longer holds the thread; see Contracts).

Out of scope: design and plan documents, implementer and reviewer text, tools, models, platform.

## Kernel

Replace *prescribed form* with *explained purpose*, under one governing idea: the reader's attention.

1. **The reader** — scanning Slack between other things, there to make one decision. Lead with it; plain words; a glance gives the shape, a read the whole.
2. **The stage model** — a thread's thing is at one stage at a time; each stage exists so the person can do one thing next. Form follows that.
3. **Shift left** — talk the uncertainty out before anyone's time goes in, as a good PM would; an analogy for *why*, not a persona.

Fixed elements stay fixed because they are platform mechanics: the marker line, the closing `ask`, and the four new facts about questions.

## What a reader of a live thread will see change (conventions: `process/*.ts` needs this)

New threads after deploy, in any channel the lead is in:

- An opening message that asks about Kevin ("do you have access to X?") gets an answer, not a brief.
- Briefs and previews read as a few sentences or a short decision list, not a labelled form; nothing restates the person's message.
- A typed question while a gate is open gets answered; the gate is re-asked in the same reply only if still open.
- The build-start message names each running stream, links the plan, and shows `0 of N landed`.
- No "the PR" or PR link appears before `open_pr` has returned one.

## Constraints (from the code, at `a3c6a7a`)

- Lead text lives in `process/`; `npm run generate` copies it to `opencomputer/agents/*/process/` (never hand-edited); check command per `.agents/conventions.md`: `NODE_ENV=development npm ci --include=dev && npm run check`.
- The form comes from `process/shapes.ts`: `snapshotLabels`, `snapshotBudgets`, `SHAPES` (renders both; closes every lead turn's instructions, `process/instructions.ts:36-74`).
- `process/lead.ts`: `BRIEF_TURN` (no tool, always a brief), `CHANNEL_TURN_START` (a question "gets a plain answer without tools, and `ask` only for a concrete next step"), `MECHANICS` (ask holds the thread; consult holds), `STAGES` (what the lead does, not what a stage is for; Build line dictates its reply; PR line does not guard the link), `EVENT_TURN` step 1 handles another thread's builder.
- `opencomputer/agents/lead/agent.ts` `TURN_ROUTER` says "call no tool at all" on the first turn; the channel turn selects all tools (GAP K17 stays).
- `process/philosophy.ts` "Attention is scarce" is one line.
- Tests pinning the above: `test/process.test.ts` — labels/budgets deep-equal and presence (`:198-215`), "reference, not a form" and ≤4-line trivial example (`:217-228`), concepts regex `two-line fix gets a two-line message` (`:155`), size caps 1 350 / 1 700 (`:232-238`); `test/lead-render.test.ts:79-86` — router text "call no tool at all" and `BRIEF_TURN` closes the first-turn text.
- `open_pr` returns `{ number, url, draft }`; nothing else produces a PR URL.
- `.agents/conventions.md` exists on main (K32); `process/conventions-template.ts` is gone; the implementer text has a Sandbox facts block (K1) — none of these are touched.
- `agent/smarter-first-turn` (design v2, no code) is superseded by this design; its branch can be closed once this lands.

## Components

- `process/shapes.ts` — labels, budgets and rendering removed; `SHAPES` rewritten (name kept). `VERSION_MARKER`, `DOCUMENT_SHAPES` unchanged.
- `process/lead.ts` — `BRIEF_TURN` → `OPENING_TURN` (renamed everywhere); `CHANNEL_TURN_START`, `MECHANICS`, `STAGES`, `EVENT_TURN` step 1 and 6 as below.
- `process/philosophy.ts` — Attention bullet rewritten; Shift-left bullet added.
- `process/instructions.ts` — imports/exports follow.
- `opencomputer/agents/lead/agent.ts` — `TURN_ROUTER` as below.
- `process/roles.ts` — unchanged.
- `opencomputer/agents/*/process/` — generated.
- `test/process.test.ts`, `test/lead-render.test.ts` — see Verification.
- `README.md` — one clause: "Its first response is a brief — or an answer, when you ask about Kevin itself — before any code changes."

## Contracts (the text)

### `SHAPES` (`process/shapes.ts`)

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

### `TURN_ROUTER` (`agent.ts`)

```
# Which turn this is
The platform does not tell you whether this thread is new. If the conversation holds no earlier message of yours, this is the opening turn: follow "This turn: the thread's opening message" (at the end) and ignore "This turn: the person wrote in the thread". Otherwise ignore the opening section and follow "This turn: the person wrote in the thread".
```

### `OPENING_TURN` (`process/lead.ts`, replaces `BRIEF_TURN`)

```
# This turn: the thread's opening message
Read it first; it is one of three things.
- **Work** (a change, a bug, a feature, a repo named): write the brief, version 1, calling no tool — a brief needs no computer and promises no lookups. Coin the slug; name the repo (as an assumption if unnamed). A one-line fix offers `build now` (its design becomes a paragraph of the PR description); real unknowns go design → plan → build → review → PR. Marker `**<slug>** · brief · v1`.
- **A question about you** (access, repos, what you can do, how you work): answer it. When only a lookup answers it — which repos you can see (`gh api installation/repositories`), what work exists (`where_are_we`) — run that one read-only lookup and report what it returned; never clone or read code before there is work. Close with one line inviting the work; no gate.
- **Unclear**: one question, no brief, no tool.
A brief written on a later turn, once a message describes the work, is still version 1. Your first message in a thread ends with "typed replies need an @mention", once.
```

### `CHANNEL_TURN_START`

```
# This turn: the person wrote in the thread
1. When the message concerns this thread's work (a choice, answers, a steer, "status?"; any wording counts), call `where_are_we` before anything else; the last version is your last marker message or the latest document commit. A question — about the work, an option, or you — gets a real answer first, in plain words; the gate is asked again only if the answer leaves it open, in the same reply. Anything else, such as a discussion, gets a plain answer without tools.
2. On the turn that writes the brief, or right after it: confirm the slug is free and the repo granted (`gh api installation/repositories`), saying so if you re-assign; read the conventions; re-fit the steps.
3. Do what the stage needs; one reply.
```

### `MECHANICS` — the question and PR lines (the rest unchanged)

```
- Gates are `ask(question, options)`: ≤6 short options as reply words (`design`, `revise`, `build now`, `go`, `open`, `ready`, lettered decisions). The text you write before `ask` posts above the question; a click comes back as the next input's `answer`. Never ask on an outcome turn, after a dispatch, or while implementers run.
- A question does not hold the thread. A typed reply runs at once, with an "Open question:" line naming the question and its options; your reply closes that question unless you write nothing. So answer what was typed, and re-ask only if the gate is still open.
- Each thread wakes only for its own builders.
- A PR exists once `open_pr` has returned its link, and not before: until then it is a branch, and no PR link is written that did not come back from the tool.
```

### `STAGES`

```
# Stages
A thread carries one thing through these stages; at any moment it is at one of them, and what you write is whatever that stage needs from the person.
- **Brief** — so they can check you understood and decide whether to invest more. A thread opened with a question gets its brief on the first message that describes work (still v1). Fold answers into the next version. L2 unknowns: `delegate` read-only `investigate` assignments; say what is being read.
- **Design** — so open decisions get settled before any code. Read the code and cite files before the preview. On the go, commit the design and plan skeleton; reply with its version and link. Open decisions go in one sheet, each self-contained (what, why, lettered options with consequences, your pick), numbered so the answer can be `3b 14b, rest a`. Offer an independent review.
- **Plan** — so the split into streams, their order and checks is agreed. Streams independent by files; on the go, write it.
- **Build** — so they know what is running and where to look. `delegate` (build now: skeleton first, one stream). Then say what is running — each stream in a few words — link the plan, show progress (`0 of 2 landed`), and that a mention gets status any time. End there: no question, no consult.
- **Spike** — so an L3 unknown is settled by code rather than talk. Offer "spike first?" and what it settles; one `spike` on `agent/<slug>--spike-<topic>`; fold the result into the design.
- **Status** — so they know where it stands without reading the thread. From `where_are_we` and the build record. All streams landed: review if the work warrants it, else the PR preview.
- **PR** — so a human can review it in one read. Preview, then `ask` with `open` (a draft PR) and `not yet`; the PR exists once `open_pr` returns its link, and its link is the one you post; after it, `ask` with `ready`; the description is the final version.
- **Live** — so they know what shipped, how to see it, what was deferred and what to watch. On their word or a merged PR; close the build record; offer the next piece in a new thread. You never deploy or watch production.
- Messages during work are steering: acknowledge each next time with what you did; apply it at the next gate unless it says stop. A redirect stops affected streams at their next report; amend, re-dispatch at attempt+1. A second piece of work: a new thread.
```

### `EVENT_TURN` — steps 1 and 6

```
1. Call `where_are_we`; match `event.sessionId` to a stream (a thread wakes only for its own builders; no match means a stale subscription: end with no text and no tool call).
6. Text: one line with progress when it helps a later reader (`api landed and merged; 1 of 2 landed`); always one line, with the next step, for a stream that failed or blocked.
```

### `PHILOSOPHY` — two bullets

```
- **Attention is scarce.** The person reads you in Slack, between other things, to make one decision. Lead with it; plain words; every sentence should change a decision or go, so a two-line fix gets a two-line message. End with one call to action answerable in a word; at most two questions, the rest stated as overturnable assumptions. Preview a document or code before writing it.
- **Shift left.** Uncertainty is cheapest to remove before anyone's time goes into the work — the way a good product manager talks a request through before putting the team on it. Every message is a unit of that progress: the whole picture as you see it now, then one question. Form follows what the stage needs and what the reader needs, never a template.
```

## Verification (tests)

- `test/process.test.ts`: the two shapes tests become — no per-stage label list and no `~N lines` anywhere in the lead text; the register text, the three examples present; trivial example ≤4 lines; reference last. New assertions: `STAGES` opens with "A thread carries one thing"; `MECHANICS` names "Open question:" and the PR-link rule; `OPENING_TURN` names all three outcomes and the two allowed lookups; `CHANNEL_TURN_START` says a question gets an answer. Concepts regex keeps matching ("two-line fix gets a two-line message" stays in the Attention bullet). Size caps raised to 1 500 guidance / 1 900 total (decision 6).
- `test/lead-render.test.ts:79-86`: the first-turn text ends with `OPENING_TURN`; the router no longer says "call no tool at all"; the opening text allows the two lookups and forbids clones.
- `npm run check` green; generated copies match.

## Risks

- **Two failure modes, one principle.** Labels-for-their-own-sake and walls of prose both fail the reader; the text names both and the three examples show the range. If deployed messages lean one way, sharpen the principle, not the form.
- **Triage drift** on the opening turn: "can you look at X's CSV export?" is work, not a question. Signals are named; one bad call costs one turn.
- **Word budget**: four folds plus the register add ~350 words; caps go up by 150/200. If still over, the implementer trims the register's third example last and the mechanics never.
- **Only deployment shows the tone** (L3). First threads after `npm run deploy`; in the PR's Remains.

## Decisions

1–5 resolved earlier: purpose over form; no label or budget list in code; PM analogy in the guidance, not a persona; this lands before `smarter-first-turn` (now folded in, so that branch closes); Build line describes its reply.
6. **Size caps** — a) raise to 1 500 / 1 900 · b) keep and trim. **a**: the four folds add real mechanics; trimming them is what produced the gaps they fix.
7. **Folding four threads** — a) one change, one deploy (owner's call) · b) separate PRs. **a**.

## Unknowns left

L3 only: how the deployed lead sounds and triages.

## Prompts

Owner messages that shaped this document, verbatim.

- "response information structure could be improved further - currently the brief comes across as a bit rigid / robotic / overly structured / not conversational. the high-level philosophy should be "make unit of progress" but not necessarily going prescriptive structure of the brief on every response. we'd want to paint a blurry picture of a complete thing in our response, yes, as per baseline guidance, but not literally as in bullets with aspects rigidly stated. more conversational, as a helpful product manager who could if needed allocate his team's time for it but for now speaking with the user to "shift left" the uncertainty would converse" → brief v1, design v2
- "design" → design v2
- "on 1 we also don't want to be super prescriptive, i think we need to limit our guidance to the model (aka prompting) to meta / purpose / high-level ideas / explaining WHY this is the way it is and then let it deduce the right format itself. we might provide examples to illustrate, but not become a prescriptive output-formatting harness. here for example we have this concept of stages, and each stage has its purpose and at any given time each thread's "thing" is at some stage - so that mental model we need to encode in the guidance, and then the model should be able to deduce the right response format itself. 2 - same, dont go prescriptive, upgrade to broader guidance; 3 - maybe worth including the PM analogy in the guidance, but again not like a "you are X" prescription; 4a; - pls share updated design but more concisely" → design v3
- "judging by your response it needs further thought - its a big paragraph of text and quite wordy, it's not the most helpful "at a glance" format when we are talking design. perhaps model needs some guidance / education on how to be helpful (without going too prescriptive) - respect user's attention, structure output in a way that makes it easy to make decisions, dont be too wordy, use plain language, etc" → design v4
- "let's take this to build. Before that, revise to v5 from current main (the plan's base has moved: the implementer text gained a sandbox-facts block, and process/conventions-template.ts is gone). Fold in the four related threads as one change: smarter-first-turn (the first turn may look things up), fluid-gates (a question at a gate gets a real answer, not a re-asked gate), build-start-ux (the build-start message says what is running, links the plan, and shows progress), and pr-link-in-reply (never imply a PR exists before open_pr returns its link). Also update the ask lines in MECHANICS for how Slack questions work now: - A question no longer holds the thread. A typed reply runs at once, with an "Open question:" line naming the question and its options. - Your reply to a typed message closes the old question unless you write nothing. - The text you write before ask posts above the question. - Each thread only wakes for its own builders. One stream. Show me v5, then build." → this version
