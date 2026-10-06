# Kevin: product development agent for Slack

One sentence in a Slack thread; Kevin answers with a brief. Reply in a
word and it moves on: design, plan, then code — built in parallel,
reviewed independently, returned as a draft pull request. A one-line fix
skips the documents, not the gates.

**Not a background coding agent.** Nothing is handed off and awaited. The work
takes shape in stages, each one a short message showing the whole thing at
its current resolution — blurry and cheap to correct first, sharp and
expensive last. Steering happens where it is cheap; code is written once,
against an agreed plan.

- Every step is one message, answered in a word.
- The design and the plan land in the repo beside the code.
- Parallel builders with fresh contexts; an independent review; a PR description written to be read in one pass.
- The process is files: three agents, a folder of process text, five tools, on [OpenComputer](https://docs.opencomputer.dev/agents/overview). Slack is the interface, GitHub the store; nothing else is deployed.

## What it looks like

> **you:** @Kevin CSV export in acme-service breaks when a customer's name has a comma. Make it safe for any name.
>
> **Kevin:** **csv-export-quoting** · brief · v1
>
> **What** quote fields that need it in `GET /customers.csv`; parse what the writer writes
> **Why** "Smith, Jr., John" shifts its row by two columns today
> **In** `src/csv.js`, `src/server.js`, tests · **Out** other formats, the customer shape
> **Unknowns** L1 names with newlines too? · L2 other callers of `parseCsv`
> **Steps** design → plan → build → review → PR (two files; your conventions want a design)
>
> ---
> **Next:** `design` · `build now` · `revise` — mention me in replies

`design` gets a preview, `go` writes `.agents/design/<slug>.md` on a branch
and links it; `plan` the same for `.agents/work/<slug>.md`; `build` starts
one builder per stream and posts a line as each lands; `status?` after the
last one sends the branch to the reviewer and returns the verdict with the
PR preview; `open` makes the draft pull request; `ready` marks it. You
merge. Every message that carries the work starts with the slug, stage and
version; anything else is conversation.

## How it works

```
   you ──Slack thread──▶ lead (Fable) ──delegate──▶ implementer ×N (Opus)   each on its own
            ▲               │  ▲   ▲                    │                   computer + branch
            │               │  │   └──outcome event─────┘
            └───reply───────┘  └──consult──▶ reviewer (Fable) ──answer──▶ lead
                                 git: agent/<slug>, agent/<slug>--<stream>, .agents/{design,work}/<slug>.md
```

- **Three agents, fresh contexts.** The lead owns the thread and the documents and never writes product code. Implementers get one stream of the agreed plan and nothing of the conversation. The reviewer reads the design or the integrated branch, never the thread.
- **One artifact, successive forms.** Brief → design file → plan file → branch + PR → production. Each form removes the uncertainty cheapest to remove there, so the next is built once.
- **State is git.** Nothing is kept on a computer between turns. `where_are_we` rebuilds the picture from branches, documents, the PR and a `kevin-state` block in the plan at every turn; `status?` works a week later.
- **Fan-out is the platform API.** `delegate` creates implementer sessions through an HTTP connection carrying the project secret and subscribes the lead to their outcomes; each finished stream arrives as an input. The reviewer is reached with `consult`, whose answer arrives as the lead's next input.
- **Tools by input source.** The agent function runs before any tool, so it cannot know the stage; it knows where the input came from. A builder's outcome may record, merge and re-dispatch, never open the PR or call the reviewer.
- **Guidance, not a harness.** `process/` explains the why, the concepts and the boundaries; message shapes are reference material the model fits to the work, so it gets better as the models do.

## Platform features it exercises

| Feature | Where |
| --- | --- |
| Slack connection: thread = session, sender identity per input | dashboard bot, `lead/agent.ts` |
| GitHub App connection with per-agent permissions (write for builders, read for the reviewer) | `*/connections/github.ts` |
| HTTP connection with a managed secret attached at the edge | `lead/connections/opencomputer.ts` |
| Management API from inside an agent: sessions, turns, event subscriptions | `lead/tools/lib/api.ts`, `delegate.ts` |
| `consult`: one agent asks another in the same project | `lead/agent.ts`, `reviewer/agent.ts` |
| Code tools running on the session's computer (`git`, `gh`) | `lead/tools/*.ts` |
| Tool selection per render from the input | `lead/agent.ts` |
| One project, three agents, two models | `opencomputer/project.ts`, each `agent.ts` |
| Per-agent bundles with a generated shared folder | `scripts/generate.ts` |

## Quick start

Node.js 22; `@opencomputer/cli` ≥ 0.7.16; rights to install a Slack app and the OpenComputer GitHub App.

1. `npm install && npm run check` — nothing here needs the platform.
2. `npx opencomputer login && npx opencomputer link --create-project kevin`.
3. Put the printed project id and `kevin` into [`config.ts`](opencomputer/agents/lead/config.ts).
4. `npm run deploy` (generate + deploy; three agents, Development).
5. `npx opencomputer github connect`; install the App on the repos Kevin may touch.
6. Dashboard → project **kevin** → **Development** → Connections → **lead** row → **Create Slack bot**; `/invite @Kevin` in a channel.
7. Create a project-scoped API key; put `OPENCOMPUTER_API_KEY=<key>` in `opencomputer/.env.local`; `npm run secret`.
8. Optional: `.agents/conventions.md` in your repo ([template](templates/conventions.md)) says what ships directly and what needs a design.
9. `@Kevin <one sentence>`.

## Running it

- **Cost.** A two-stream feature runs four model sessions (two Opus builders on their own computers, two Fable); the dashboard shows each.
- **Stop.** A running builder cannot be interrupted; say stop and Kevin applies it at that builder's next report.
- **Blocked.** A builder that cannot finish says so; Kevin tells you and re-dispatches on your word.
- **Quiet periods.** A review takes up to ten minutes with nothing posted; messages sent meanwhile are held and answered with the verdict.
- **Slack limits.** Replies reach Kevin only with an @mention; a thread has one owner. Buttons for the gates are in progress on the platform side.
- **When it breaks.** `npx opencomputer session list | inspect <id> | logs --session <id>`. A session whose computer failed to start keeps failing: start a new thread.
- **Production.** `npx opencomputer deploy --alias production`, a Slack bot on the Production row, `environment: "production"` in `config.ts` before `npm run secret`.

## Adapting it

- **Process:** `.agents/conventions.md` in the target repo.
- **Voice and method:** [`process/`](process/) — edit the source; `npm run generate` copies it into each agent (the copies say so on line 1).
- **Capabilities:** [`lead/tools/`](opencomputer/agents/lead/tools/), selected in `agent.ts`.
- **Models:** one `useModel` line per agent. **Docs elsewhere:** `docsRepo` in `config.ts`.

## Status

Verified live on 2026-10-06 (Development, diggerhq Slack): brief, `status?`,
design preview; the lead's GitHub tool on the platform's computers. Build,
review and PR are built and tested but have not yet run end to end in a
thread. `consult` is a platform tool not yet in the public docs; if it is
unavailable Kevin says the review could not run. Known platform gaps met
while building are in [`DX-NOTES.md`](DX-NOTES.md).

## Layout

```
opencomputer/project.ts            kevin: lead, implementer, reviewer
opencomputer/agents/lead/          agent.ts · config.ts · connections/{github,opencomputer}.ts
                                   tools/{where-are-we,delegate,commit-document,integrate,open-pr}.ts
opencomputer/agents/implementer/   agent.ts · connections/github.ts (write)
opencomputer/agents/reviewer/      agent.ts · connections/github.ts (read)
process/                           the process text (source); each agent's process/ is generated
scripts/                           generate.ts (copy + --check) · set-secret.ts (npm run secret)
templates/conventions.md           for target repositories
test/                              renders with authored inputs; tools against stubbed fetch / a local repo
```

`npm run check` = generate --check · typecheck · tests · doctor.
