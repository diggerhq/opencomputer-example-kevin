# smarter-first-turn — design

- thread: `1791325543.276999` (#product)
- repo: `diggerhq/opencomputer-example-kevin` · branch `agent/smarter-first-turn` · base `main`
- version: 2
- lead session: `ses_eecb02b34ffdYsQBzIKZjvXuz5`

## Brief

**What** the lead's first turn in a thread treats every opening message as a work request and must write a brief with no tool call; make it read the message first and respond in kind — answer a question about Kevin (looking up what the question needs), brief a piece of work, ask one question when unclear — and make the brief itself shorter.
**Why** this thread: "do you have access to X and Y?" got a non-answer because the rule forbade the lookup and demanded a piece of work first. Separately, the brief has grown to ~12 lines with In/Out/Where sections that often restate the message.
**Out** new tools, model changes, implementer/reviewer text, platform changes (the first-turn signal, K17, stays a platform item).

## Kernel

The opening turn is **triage**, not the brief. Three outcomes: answer · brief · one question. The brief is written on whichever turn first describes work, and is held to ~8 lines whose every line changes a decision.

## Constraints (from the code and the knowledge base)

- The render cannot tell a thread's first turn (GAP K17, `opencomputer/agents/lead/agent.ts:44-57`): channel turns select every tool and a router paragraph (`TURN_ROUTER`, `agent.ts:59`) makes the model pick the path from its own transcript. That stays; only the text the router points to changes.
- "No lookups on the brief" (`process/lead.ts:32` `BRIEF_TURN`; work 040 "Stage detection") exists for two reasons: a brief is a sentence-level artifact that should not wait on a clone, and a turn that calls nothing leases no computer (the computer is lazy). Both reasons hold for a *brief*; neither holds for a *question whose answer is a lookup*. The design keeps briefs lookup-free and allows one read-only lookup when the message asks for it.
- `leadInstructions({ source, firstTurn })` (`process/instructions.ts:32-39`) is a contract named in work 040; its signature is unchanged. The `firstTurn: true` branch returns the opening-turn text.
- `process/` is the single source; `npm run generate` copies it into `opencomputer/agents/lead/process/`; `npm run check` must be green.
- Tests do not pin phrasing except contracts (`test/process.test.ts` header). Two assertions pin the current first-turn wording and the brief budget and will move with the text: `test/lead-render.test.ts:85-87`, `test/process.test.ts:164-173`.

## Components

| Component | File | Change |
| --- | --- | --- |
| Router | `opencomputer/agents/lead/agent.ts` `TURN_ROUTER`, and the final `BRIEF_TURN` import/placement | points the no-prior-message case to "the thread's opening message"; no longer says "call no tool at all" (the opening text says when a tool is allowed) |
| Opening turn text | `process/lead.ts` `BRIEF_TURN` → `OPENING_TURN` (export kept under both names or renamed everywhere) | the triage text below |
| Channel turn start | `process/lead.ts` `CHANNEL_TURN_START` step 3 | "Right after the brief" → "On the turn that writes the brief, or right after it" (the brief may now be written on a later turn, after `where_are_we`) |
| Stages | `process/lead.ts` `STAGES` Brief line | adds: a thread opened with a question gets its brief on the first message that describes work; still version 1 |
| Brief shape | `process/shapes.ts` `snapshotLabels.brief`, `snapshotBudgets.brief`, the two examples, `SHAPES` intro | labels `What · Why · Unknowns · Steps` (In/Out/Questions only when they cut scope or block); budget 8; a brevity rule (below); examples trimmed to match |
| Generated copies | `opencomputer/agents/*/process/*` | `npm run generate` |
| Tests | `test/lead-render.test.ts`, `test/process.test.ts` | first-turn render: opening text closes the instructions, allows the named lookups, forbids clones; budgets/labels updated; a new assertion that the first-turn text names all three outcomes |
| README | `README.md:148` | "Its first response is a brief, before any code changes" → "…a brief — or an answer, when you ask about Kevin itself — before any code changes" |

## Contracts (the text)

### `OPENING_TURN` (replaces `BRIEF_TURN`)

```
# This turn: the thread's opening message
Read the message first; it is one of three things.
- **Work** (a change, a bug, a feature, a repo named): write the brief, version 1, calling no tool — a brief needs no computer and promises no lookups. Coin the slug; name the repo (as an assumption if unnamed). A one-line fix offers `build now` (its design becomes a paragraph of the PR description); real unknowns go design → plan → build → review → PR. Marker `**<slug>** · brief · v1`.
- **A question about you** (access, repos, what you can do, how you work): answer it. When only a lookup answers it — which repos you can see (`gh api installation/repositories`), what work exists (`where_are_we`) — run that one read-only lookup and report what it returned. Never clone or read code before there is work. Close with one line inviting the work; no gate.
- **Unclear**: one question, no brief, no tool.
A brief written on a later turn, once a message describes the work, is still version 1. Your first message in a thread ends with "typed replies need an @mention", once.
```

### `TURN_ROUTER`

```
# Which turn this is
The platform does not tell you whether this thread is new. If the conversation holds no earlier message of yours, this is the opening turn: follow "This turn: the thread's opening message" (at the end) and ignore "This turn: the person wrote in the thread". Otherwise ignore the opening section and follow "This turn: the person wrote in the thread".
```

### Brief shape (`shapes.ts`)

- `snapshotLabels.brief = ["What", "Why", "Unknowns", "Steps", "Next"]`; `snapshotBudgets.brief = 8`.
- Added to `SHAPES`, after the layout line: "A brief is the shortest version: ~8 lines, one per label, no preamble before the marker, nothing the message already says; In/Out only when they cut scope the person might assume, a question only when an assumption would not do."
- The feature example loses nothing it needs (What · Why · Unknowns · Steps already); the two-line example stands.

### `CHANNEL_TURN_START` step 3

```
3. On the turn that writes the brief, or right after it: confirm the slug is free and the repo granted (`gh api installation/repositories`), saying so if you re-assign; read the conventions; re-fit the steps.
```

### `STAGES` · Brief

```
- **Brief.** A thread opened with a question gets its brief on the first message that describes work (still v1). Fold answers into the next version. L2 unknowns: `delegate` read-only `investigate` assignments; say what is being read.
```

## Risks

- **Triage drift**: "can you look at acme-service's CSV export?" is work, not a question; "what repos do you have?" is a question. The text names the signals (a change, a bug, a feature, a repo named vs access, repos, capabilities); one bad call costs one turn.
- **Lease on question turns**: a lookup starts the computer (`gh api` runs in the shell; `where_are_we` does not). Accepted: it happens only when the person asked for exactly that.
- **Brevity vs signal**: an 8-line budget could drop a scope line the person needed. Mitigated by "In/Out when they cut scope"; the budget is calibration, not a quota (as today).
- **Knowledge base drift**: work 040 "Stage detection" and design 019 §16 (K17 row) describe the old behaviour. This thread writes only to the Kevin repo; the PR's "Remains" names the two KB lines to amend.

## Decisions

1. **Lookups on the opening turn** — a) none, as today · b) one read-only lookup when the question needs it (`gh api installation/repositories`, `where_are_we`), never a clone · c) any tool. **Pick b**: answers the access question in one turn; keeps briefs lookup-free.
2. **After an answered question** — a) one plain line inviting the work, no `ask` gate · b) an `ask` with a "describe the work" button · c) write a speculative brief. **Pick a**: a gate on an open-ended reply is noise; the person types the work anyway.
3. **Brief size** — a) keep ~12 lines, tighten wording · b) ~8 lines, labels What · Why · Unknowns · Steps, In/Out/Questions only when they cut scope or block · c) ~5 lines, What · Steps. **Pick b**: Why and Unknowns are where the person corrects the hypothesis; In/Out mostly restate.
4. **The brief on a later turn** — a) same turn as the work-describing message, with `where_are_we` and the slug/repo checks done there · b) brief first, checks the turn after. **Pick a**: one round-trip fewer; the turn already has the computer.
5. **README** — a) one clause added at `README.md:148` · b) unchanged. **Pick a**.
6. **Knowledge base** — a) named in the PR's Remains for a KB session · b) edited in this thread. **Pick a**: one code repo per thread; the KB is not the code repo here.

## Unknowns left

L1: decisions 1–6 above. L2: none (code and KB read). L3: how often the model misreads a one-line work request as a question; visible in the first threads after deploy.

## Prompts

Owner messages that shaped this document, verbatim.

- "do you have access to the Kevin example repo (your code)? and to the ws serverless agents repo (the knowledge base)?" → (the opening message that exposed the gap)
- "well then the first piece of work would be to change the behaviour so that it doesn't require explicitly setting piece of work, need to be a but smoother/smarter" → brief v1
- "design" → this document
- "also i think wed want the initial pre design brief to be more concise. more effort towards brevity without losing signal" → §Brief shape, decision 3
