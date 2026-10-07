# conversational-brief — plan

- thread: `1791387966.516249` (#dev)
- lead session: `ses_ee8fe53c9ffddlDU2HK8uide4C`
- repo: `diggerhq/opencomputer-example-kevin` · branch `agent/conversational-brief` · base `main` (merged at `a3c6a7a`)
- version: 5
- design: `.agents/design/conversational-brief.md`

```kevin-state
{
  "version": 5,
  "leadSessionId": "ses_ee8fe53c9ffddlDU2HK8uide4C",
  "threadId": "1791387966.516249",
  "subscriptionId": "evs_4ea928b7e67d4e1caad519b874e80985",
  "streams": [
    {
      "stream": "lead-text",
      "attempt": 1,
      "sessionId": "d87ebddd-b0cf-9733-8b7b-fe03a277513e",
      "branch": "agent/conversational-brief--lead-text",
      "state": "blocked"
    }
  ]
}
```

## Design summary

The lead's guidance stops prescribing message form and explains purpose instead: the reader's attention, the stage model, shift-left. Folded into the same text change: opening-turn triage with one read-only lookup, real answers to typed questions at a gate, a build-start message that names streams / links the plan / shows progress, no PR link before `open_pr` returns one, and the new `ask` mechanics. Text-only in `process/` and the lead's router, tests updated, one README clause.

## Code map

- `process/shapes.ts` — labels, budgets, rendering removed; `SHAPES` → register text with three examples
- `process/lead.ts` — `BRIEF_TURN` → `OPENING_TURN`; `CHANNEL_TURN_START`, `MECHANICS`, `STAGES`, `EVENT_TURN` steps 1 and 6
- `process/philosophy.ts` — Attention rewritten, Shift-left added
- `process/instructions.ts` — imports/exports follow
- `opencomputer/agents/lead/agent.ts` — `TURN_ROUTER`
- `opencomputer/agents/*/process/` — `npm run generate` only
- `test/process.test.ts`, `test/lead-render.test.ts` — per the design's Verification
- `README.md` — one clause

## Streams

### lead-text (build)

- files: `process/shapes.ts`, `process/lead.ts`, `process/philosophy.ts`, `process/instructions.ts`, `opencomputer/agents/lead/agent.ts`, `opencomputer/agents/lead/process/*`, `opencomputer/agents/implementer/process/*`, `opencomputer/agents/reviewer/process/*` (generated only), `test/process.test.ts`, `test/lead-render.test.ts`, `README.md`
- checks: `NODE_ENV=development npm ci --include=dev && npm run check`
- done-when: every contract block in the design's Contracts section is in the source verbatim (trimming allowed only in the register's third example, and only if the size caps fail at 1 500 / 1 900); the tests in the design's Verification pass; generated copies match; checks green.
- depends-on: none

## Order

Single stream.

## Verification

Checks green on `agent/conversational-brief` after integration; a reviewer pass on the build before the PR.

## How to resume

`where_are_we` with thread `1791387966.516249`; design and plan on `agent/conversational-brief`.

## Build record

### lead-text@1 — blocked (2026-10-07)

- landed: `c4e52f4` "Explain purpose instead of prescribing form in the lead's text" on `agent/conversational-brief--lead-text`
- checks: **fail** — one test red, `test/process.test.ts` size test: channel turn 1 664 guidance words (cap 1 500), 2 147 total (cap 1 900). Everything else green: generated copies in sync, typecheck, 89/90 tests, doctor (one local warning, no development API key).
- blocked: the design's caps (decision 6a) are ~170 / ~250 words short of the contract text verbatim. The only trim the design allowed (the register's third example) sits in `SHAPES`, which the guidance count excludes, so it cannot fix the guidance cap; the total would still be ~2 057.
- measured (guidance / total): brief 990 / 1 396; channel 1 664 / 2 147; event 801 / 801; answer 1 273 / 1 756. Base: brief 751 / 1 037; channel 1 335 / 1 698; event 727 / 727; answer 1 129 / 1 492.
- amendments reported:
  - MECHANICS: the four question/PR lines replaced the old Gates line, in contract order, before the unchanged consult line.
  - PHILOSOPHY: Shift-left bullet placed right after Attention.
  - `test/process.test.ts:40-45` ("the build reply") pinned the old Build wording; rewritten to the new one (what is running, plan link, `0 of 2 landed`). Not in the design's Verification.
  - Comments only: GAP(K17) comment in `agent.ts`, headers in `shapes.ts`, `lead.ts`, `instructions.ts` now describe the opening turn.
- next: lead decides — raise the caps to 1 700 / 2 200 (design decision 6 amended) or name contract text to shorten; then re-dispatch at attempt 2.

## Prompts

See the design's Prompts section.
