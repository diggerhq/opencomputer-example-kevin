# conversational-brief — plan

- thread: `1791387966.516249` (#dev)
- lead session: `ses_ee8fe53c9ffddlDU2HK8uide4C`
- repo: `diggerhq/opencomputer-example-kevin` · branch `agent/conversational-brief` · base `main`
- version: 4
- design: `.agents/design/conversational-brief.md`

```kevin-state
{
  "version": 4,
  "leadSessionId": "ses_ee8fe53c9ffddlDU2HK8uide4C",
  "threadId": "1791387966.516249",
  "streams": []
}
```

## Design summary

The lead's guidance stops prescribing message form (per-stage labels, line budgets) and instead explains purpose: a thread's thing is at one stage at a time, each stage exists so the person can do one thing next, and the form follows from that. The PM analogy and "shift left" enter the philosophy; two prose briefs illustrate the register. Text-only in `process/`, with the tests that pinned the form rewritten.

## Code map

- `process/shapes.ts` — labels, budgets and their rendering removed; `SHAPES` → register text with two examples
- `process/lead.ts` — `STAGES` framing line, purpose-first stage lines, Build line describes its reply
- `process/philosophy.ts` — Shift-left bullet
- `process/instructions.ts` — exports follow the removals
- `opencomputer/agents/*/process/` — `npm run generate`
- `test/process.test.ts` — shapes tests → register/purpose tests

## Streams

Written at the plan stage.

## Order

Single stream.

## Verification

`npm run check` green on the integration branch; the design's two examples present verbatim in the generated lead text; no per-stage label list or line count anywhere in the lead's instructions.

## How to resume

`where_are_we` with thread `1791387966.516249`; design and plan on `agent/conversational-brief`.

## Build record

(empty)

## Prompts

See the design's Prompts section.
