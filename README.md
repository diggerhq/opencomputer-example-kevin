# An engineering teammate in Slack

Mention Kevin with one sentence and it turns it into pull requests, with as
much process as the work deserves and no more. A one-line fix gets one
message and a pull request. Anything bigger goes through a brief, a design
and a plan, each one short message in the thread that you answer in a word,
before any code is written; then parallel builders, an independent review,
and a draft pull request written to be read in one pass. Kevin stays lazy on
purpose: it holds at a stage until the biggest unknowns there are settled,
and it asks before it builds.

It is an [OpenComputer](https://docs.opencomputer.dev/agents/overview)
project in plain TypeScript you can change: three agents, a folder of
process text, and the tools the lead calls. OpenComputer handles Slack, the
conversations, the computers, the GitHub credentials and the fan-out to
builders; there is no server, queue or database to run. Slack is the
interface and GitHub is the store.

## What it looks like

The [fixture repository](https://github.com/diggerhq/opencomputer-fixture-acme-service)
carries a defect on purpose: names with commas shift columns in
`GET /customers.csv`. In a channel Kevin is in:

> **you:** @Kevin CSV export in acme-service breaks when a customer's name
> has a comma. Make it safe for any name and serve it as a download.

> **Kevin:** *csv-export-quoting* · brief · v1\
> **What:** `GET /customers.csv` quotes every field that needs it; `parseCsv` reads what the writer writes; the response downloads as a file\
> **Why:** "Smith, Jr., John" shifts its row by two columns today\
> **In:** writer and parser in `src/csv.js`; response headers in `src/server.js`\
> **Out:** other formats; the customer record shape\
> **Unknowns:** L1: names with newlines too? · L2: other callers of `parseCsv`\
> **Steps:** design → plan → build (your conventions want a design when two modules change)\
> **Questions:** newlines in scope?\
> Next: *design* · *build now* · *revise*\
> Repo: diggerhq/opencomputer-fixture-acme-service (the only one granted). Mention me in replies.

Every message that carries the work starts with that header line: the
slug, the stage, a version number. Anything without it is conversation.

> **you:** @Kevin yes to newlines. design

> **Kevin:** *csv-export-quoting* · design preview · v2\
> **Kernel:** RFC 4180 quoting in one writer and one parser; the route adds `content-disposition: attachment`\
> **Components:** `src/csv.js`; `src/server.js`; their tests\
> **Contracts:** `exportCustomersCsv` and `parseCsv` keep their signatures\
> **Risks:** a consumer that splits on `,` itself\
> **Decisions:** 1 quote only when needed (recommended) · 2 keep `\n` line ends (recommended)\
> **Unknowns left:** none at L1 or L2\
> Next: *go* · *revise*

> **you:** @Kevin go

Kevin writes `.agents/design/csv-export-quoting.md` on the branch
`agent/csv-export-quoting`, with a plan skeleton beside it, and posts the
design's summary with the file's link and *plan* · *review* · *revise*.
*review* sends the design to a reviewer with no knowledge of the thread
before any plan exists. Here, *plan*:

> **Kevin:** *csv-export-quoting* · plan preview · v4\
> **Streams:** csv: `src/csv.js`, `test/csv.test.js`, done when names with commas, quotes and newlines round-trip · route: `src/server.js`, done when the response carries `content-disposition`\
> **Order:** one group, both in parallel\
> **Checks:** `npm test`\
> Next: *go* · *revise*

> **you:** @Kevin go
>
> **Kevin:** *csv-export-quoting* · plan · v5 — two streams, `.agents/work/csv-export-quoting.md`. Next: *build* · *revise*
>
> **you:** @Kevin build
>
> **Kevin:** Two builders on it, csv and route. Mention me any time for status.

Each builder works on its own branch on its own computer and reports to
Kevin, which merges each stream into `agent/csv-export-quoting` when its
checks pass. Later:

> **you:** @Kevin status?

With both streams landed, Kevin sends the branch to the reviewer and answers
with the verdict:

> **Kevin:** *csv-export-quoting* · review · v6\
> **Verdict:** ship\
> **Findings:** low: no test for a name that is a lone `"` (deferred: listed under what remains in the PR)\
> **Folded:** none\
> **PR:** "Quote CSV fields and serve the export as a download" · 4 files · `npm test` green\
> Next: reply *open* for a draft PR

> **you:** @Kevin open
>
> **Kevin:** Draft pull request: _link_. Over to you; *ready* marks it ready for review.

The description says what changed and why, what to read first, how it was
verified and what remains, and links the design, the plan and the thread.
You merge; tell Kevin, or mention it later, and it closes the thread with
what shipped and what to watch.

A one-liner takes two messages:

> **you:** @Kevin `GET /health/` answers 404; it should answer like `GET /health`.
>
> **Kevin:** *health-trailing-slash* · brief · v1 — one route in `src/server.js` plus a test; no design needed. Next: *build now* · *revise*
>
> **you:** @Kevin build now
>
> **Kevin:** Draft pull request: _link_. The design is the first paragraph of its description.

`status?` works at any point, a week later included: Kevin rebuilds the
picture from GitHub and posts the current version.

Two Slack facts shape the conversation. In a channel thread, replies reach
Kevin only when they mention it; its first message says so once. A thread
belongs to whoever started it; someone else writing to Kevin in it starts
their own conversation.

## Quick start

Needs Node.js 22, `@opencomputer/agent` 0.9.0 and `@opencomputer/cli`
0.7.16 or later, permission to install a Slack app in your workspace, and
GitHub access to install the OpenComputer GitHub App.

1. Clone this repository, `npm install`, then `npm run check`: generated
   files in sync, typecheck, tests and `opencomputer doctor`, none of which
   need the platform. Doctor warns that `OPENCOMPUTER_API_KEY` is unset
   locally; the deployed agent reads it from the project secret (step 7).
2. `npx opencomputer login`, then
   `npx opencomputer link --create-project kevin`. It creates the project
   and prints its id.
3. In [`config.ts`](opencomputer/agents/lead/config.ts) set `projectId` to
   that id and `agentPrefix` to the project's slug (`kevin`). Optional:
   `docsRepo` (`owner/name`) to keep designs and plans in a separate
   repository, `maxImplementers` (default 7). Models are one line in each
   `agent.ts`.
4. `npm run generate`, then `npx opencomputer deploy`. One command deploys
   all three agents to the Development environment.
5. `npx opencomputer github connect`, and install the GitHub App on the
   repositories Kevin may work on (and on `docsRepo`). The installation is
   the whole list; there is none in config.
6. In the dashboard: project **kevin** → **Development** → **Connections** →
   the **lead** row → **Create Slack bot**, named Kevin. Each row is one agent
   in one environment; any other row binds Slack to a builder or to
   Production. Invite the bot to a channel (`/invite @Kevin`); mentions only
   arrive from channels it is in.
7. Create a project-scoped API key in the dashboard and store it as the
   project secret `OPENCOMPUTER_API_KEY`. The lead uses it to start builder
   sessions. Project scope matters: it is everything the key can reach.
8. Optional: copy [`templates/conventions.md`](templates/conventions.md) to
   `.agents/conventions.md` in each repository Kevin works on. It says what
   may ship directly and what always gets a design; without it Kevin always
   proposes documents.
9. In the channel: `@Kevin <one sentence>`. Kevin's first reply ends with
   "mention me in replies"; from there the thread is the whole interface.

After any change: `npm run generate`, then `npx opencomputer deploy`
(`npm run deploy` does both). Reconnecting Slack or GitHub is not needed.

## How it works

**Three agents, two models, fresh contexts.** The lead (Fable 5.1) is the
only one in the thread: it writes the brief, design and plan, starts
builders, merges their branches, judges reviews and writes the pull
request. Implementers (Opus 5.5, up to seven at once) each get one stream of
an agreed plan and nothing of the conversation, so a builder cannot drift
toward something said and later dropped. The reviewer (Fable 5.1) reads the
design, or the plan and the integrated branch, never the thread, so it
judges what was built rather than what was meant.

**Each step is one message.** A thread produces one artifact in successive
forms: the brief, a design file, a plan file, a branch and its pull request,
the change in production. Each form exists to remove the uncertainty that is
cheapest to remove there, so the next form is built once. Every message
Kevin sends is either the artifact's next version, whole at its current
resolution and ending in one call to action, or plain conversation. A
version asks at most two questions and states everything else as
assumptions you can overturn; a preview comes before any document or code
is written, and your *go* is the point where it starts working on its own.

**Who never does what.** The lead never writes product code. An
implementer never decides a contract, touches another stream's files,
merges, or writes documents; a contract gap goes back to the lead, which
amends the design and dispatches again. The reviewer never fixes or writes:
it has no code tools and its GitHub connection is read-only. Nothing merges
the pull request.

**State lives in the thread and in git.** The thread is the conversation;
the record is in GitHub. Documents are `.agents/design/<slug>.md` and
`.agents/work/<slug>.md` on `agent/<slug>`; builders push to
`agent/<slug>--<stream>`. The plan carries a `kevin-state` JSON block with
the version and every builder session, and the lead's `where_are_we` tool
reads branches, documents, the pull request and that block through the
GitHub API at the start of every turn. That is why `status?` works a week
later.

**Fan-out goes through the platform API.** The lead starts implementer
sessions with the `opencomputer` connection, which attaches the project
secret at the edge, and subscribes its own session to their outcomes; each
finished stream arrives as an input of its own. The reviewer is consulted
directly by the lead and answers as the lead's next input.

**The tools are chosen by where the input came from.** OpenComputer calls
the agent function before every model step, before any tool has run, so
the function cannot know the stage; the model reads that from
`where_are_we`. What the function can know is the input's source, and that
decides what the lead may do. A builder's outcome may record, merge and
dispatch, but never open the pull request or call the reviewer: those wait
for you. [`agent.ts`](opencomputer/agents/lead/agent.ts), abridged:

```ts
export default function Lead() {
  useModel("anthropic/claude-fable-5.1");
  const input = useInput();

  useConnection(github);
  useConnection(opencomputer);

  if (input.source === "event") {
    // An implementer finished: record it, merge it, re-dispatch on failure.
    useTool(whereAreWe);
    useTool(integrate);
    useTool(commitDocument);
    useTool(delegate);
  } else {
    // A Slack message, or the reviewer's answer: every lead tool.
    useTool(whereAreWe);
    useTool(delegate);
    useTool(commitDocument);
    useTool(integrate);
    useTool(openPr);
  }

  return instructionsFor(input);
}
```

The instructions come from `process/`: why the method works the way it
does, the platform mechanics and boundaries each role must keep, what each
stage is for, the report formats the builders and the reviewer answer in,
and reference shapes for Slack messages that the lead fits to the work.

## Where to change it

- **How much process a piece of work gets:** `.agents/conventions.md` in
  the target repository ([template](templates/conventions.md)).
- **What Kevin says and when it moves on:** the text in
  [`process/`](process/). Each agent compiles alone and may not import
  outside its directory, so `npm run generate` copies `process/` into every
  agent; edit the source, never the copies.
- **What the lead can do:** the tools in
  [`opencomputer/agents/lead/tools/`](opencomputer/agents/lead/tools/),
  selected in its `agent.ts`.
- **The models:** one `useModel` line in each agent's `agent.ts`.
- **Where documents go, how many builders:** `docsRepo` and
  `maxImplementers` in [`config.ts`](opencomputer/agents/lead/config.ts).

## Reference

Every stage, what Kevin posts and what you reply. Any reply is accepted; a
word skips forward or goes back.

| Stage | Kevin posts | You reply |
| --- | --- | --- |
| Brief | What, Why, In, Out, Unknowns, Steps, at most two questions | the answers; *design*, *build now* or *revise* |
| Design preview | Kernel, Constraints, Components, Contracts, Risks, Decisions, Unknowns left | *go*, or decisions by number (`2b, rest a`) |
| Design | the summary and the file's link | *plan*, *review* or *revise* |
| Design review | Verdict, findings with Kevin's call on each, what was folded | *plan* or *revise* |
| Plan preview | Streams with files and done-when, Order, Checks, Unknowns left | *go* |
| Plan | the streams and the file's link | *build* |
| Build | who is on what | *status?* any time |
| Review and PR preview | Verdict, findings, what was folded; title, files, checks | *open* |
| PR | the draft pull request's link | *ready* |
| Live | what shipped, how to see it, what was deferred, what to watch | the next piece of work, in a new thread |

When an unknown resolves faster by writing code than by talking, Kevin
offers a spike instead of the build: one builder on a throwaway branch,
with the result folded into the design.

Layout:

- `opencomputer/project.ts`: the project `kevin` and its three agents.
- `opencomputer/agents/lead/`: `agent.ts` (tools by input source),
  `config.ts`, `connections/` (`github`, `opencomputer`), `tools/`
  (`where-are-we`, `delegate`, `commit-document`, `integrate`, `open-pr`).
- `opencomputer/agents/implementer/`: `agent.ts`, a write-scoped `github`
  connection.
- `opencomputer/agents/reviewer/`: `agent.ts`, a read-only `github`
  connection.
- `process/`: the one source of the process text; each agent's `process/`
  is a generated copy.
- `scripts/generate.ts`: the copy, and `--check` for drift.
- `templates/conventions.md`: for target repositories.
- `test/`: renders with authored inputs, tools against a stubbed `fetch`
  or a local Git repository, the generator.
- `DX-NOTES.md`: dated findings from building it.
