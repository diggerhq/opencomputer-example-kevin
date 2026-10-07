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
  "streams": []
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

(empty)

## Prompts

See the design's Prompts section.
