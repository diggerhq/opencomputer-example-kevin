# conversational-brief — plan

- thread: `1791387966.516249` (#dev)
- lead session: `ses_ee8fe53c9ffddlDU2HK8uide4C`
- repo: `diggerhq/opencomputer-example-kevin` · branch `agent/conversational-brief` · base `main`
- version: 2
- design: `.agents/design/conversational-brief.md`

```kevin-state
{
  "version": 2,
  "leadSessionId": "ses_ee8fe53c9ffddlDU2HK8uide4C",
  "threadId": "1791387966.516249",
  "streams": []
}
```

## Design summary

The lead's Slack voice changes from labelled bullets per stage to prose: a product manager talking the uncertainty out of the work, one unit of progress per message, the whole picture then one question. `process/shapes.ts` loses its labels and line budgets and gains a voice reference with two prose examples and a coverage sentence; philosophy gets a Voice bullet; the lead's role line says how it talks. Text-only, in `process/`, with the tests that pin the form updated.

## Code map

- `process/shapes.ts` — `SHAPES` → `VOICE` (alias kept), `snapshotLabels` → `snapshotAspects`, `snapshotBudgets` removed, examples in prose
- `process/philosophy.ts` — Voice bullet; Attention bullet trimmed
- `process/roles.ts` — `ROLES.lead` clause
- `process/lead.ts` — `STAGES` Build line
- `process/instructions.ts` — exports follow the renames
- `opencomputer/agents/*/process/` — `npm run generate`
- `test/process.test.ts` — shapes tests → voice tests

## Streams

Written at the plan stage.

## Order

Single stream.

## Verification

`npm run check` green on the integration branch; the design's two prose examples present verbatim in the generated lead text.

## How to resume

`where_are_we` with thread `1791387966.516249`; design and plan on `agent/conversational-brief`.

## Build record

(empty)

## Prompts

See the design's Prompts section.
