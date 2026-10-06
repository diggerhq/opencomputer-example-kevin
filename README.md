# Kevin: product development agent for Slack

Kevin works through the approach with you before writing code. Refine the
brief, design and plan in the thread; separate agents then implement and
review the change, returning a draft pull request. Small fixes can go
straight to building.

It runs as one [OpenComputer serverless agents](https://docs.opencomputer.dev/agents/overview)
project, with Slack for conversation and GitHub for documents and code.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/how-it-works-dark.svg">
  <img alt="Kevin's workflow: you steer the brief, design and plan; the lead coordinates builders and a reviewer, then opens a pull request." src="docs/how-it-works-light.svg" width="100%">
</picture>

**Experimental:** brief, status and design preview verified live on
2026-10-06. The full build → review → PR path still needs an end-to-end run.

## In a thread

An illustrative exchange:

> **You:** @Kevin CSV export in acme-service breaks when a customer's name has a comma.
>
> **Kevin:** I'll check the writer and parser, then propose the change and its tests. Keep the current CSV format?
>
> [ design ] [ build now ] [ revise ]
>
> **You:** @Kevin Yes. Handle quotes and newlines too, but keep the parser's public API unchanged.

Kevin revises the approach before building. Once approved, the design and
plan land in `.agents/design/` and `.agents/work/` on `agent/<slug>`, with
links posted to the thread. The plan assigns independent files and checks
to each builder; their branches merge into that working branch.

Builders report back as they finish. When all have landed, mention
`@Kevin review` to start the review. Kevin assesses the findings and shows
the proposed PR description; **open** creates the draft, **ready** marks it
ready for review. You merge.

Buttons answer Kevin's questions without a mention. Typed replies need
`@Kevin`, including `@Kevin status?`. Use a new thread for another piece of
work.

## The agents

Kevin has three [agent definitions](https://docs.opencomputer.dev/agents/projects)
in [`project.ts`](opencomputer/project.ts). Each defines a model, tools and
instructions. A [session](https://docs.opencomputer.dev/agents/sessions) is
a conversation with one of those agents: each Slack thread has a lead
session, and each builder assignment starts a separate implementer session.

```ts
export default { name: "kevin", agents: ["lead", "implementer", "reviewer"] };
```

- **[Lead](opencomputer/agents/lead/agent.ts) — Fable.** Keeps the conversation,
  writes the documents and integrates branches. It owns the approach; its
  instructions leave product code to the builders.
- **[Implementer](opencomputer/agents/implementer/agent.ts) — Opus.** Gets
  one assignment and its own computer and branch. Builders read the agreed
  documents, implement and run checks without inheriting discarded ideas
  from the conversation. Independent assignments run in parallel.
- **[Reviewer](opencomputer/agents/reviewer/agent.ts) — Fable.** Reads the
  artifacts without the conversation, judging what was written rather than
  what the lead intended. Its [GitHub connection](opencomputer/agents/reviewer/connections/github.ts)
  has read permissions; its instructions prohibit local writes and running tests.

An agent function selects a model, tools and connections, then returns
instructions. Here is the implementer's entry point, with imports and
helpers omitted:

```ts
export default function Implementer() {
  useModel("anthropic/claude-opus-5.5");
  const parsed = parseAssignment(useInput().payload);
  if (!parsed.ok) {
    return [implementerInstructions(), renderRefusal(parsed.problems)]
      .join("\n\n");
  }
  useTool("sandbox_exec");
  useConnection(github);
  return [implementerInstructions(), renderAssignment(parsed.assignment)]
    .join("\n\n");
}
```

OpenComputer runs the [model and tool loop](https://docs.opencomputer.dev/agents/hooks),
handles Slack delivery and starts computers as needed. There is no webhook
server, job queue or application database to operate. Kevin's
[`delegate`](opencomputer/agents/lead/tools/delegate.ts) tool creates builder
sessions through the API and subscribes the lead to their outcomes. A
completed builder wakes the lead with its report; `consult` requests a
review, and `ask` posts the Slack buttons.

The lead selects tools by input source: builder reports can trigger
integration, but review and PR approval require a person to continue the
thread. OpenComputer stores conversations and session history. GitHub stores
the design, plan, code and builder session IDs (`kevin-state` in the plan).
The lead reads remote state on follow-ups; its local clone is a cache.
GitHub App permissions differ per agent. The lead's API key is attached
to requests by a managed HTTP connection, rather than exposed to the model.

## Run your own

Requires Node.js 22, an OpenComputer account, and permission to install apps
in your Slack workspace and GitHub repositories. Packages are pinned by
the lockfile.

1. Clone and create the OpenComputer project:

   ```bash
   git clone https://github.com/diggerhq/opencomputer-example-kevin.git
   cd opencomputer-example-kevin
   npm ci
   npx opencomputer login
   npx opencomputer link --create-project kevin
   ```

2. In [`config.ts`](opencomputer/agents/lead/config.ts), replace `projectId`
   with the printed ID and set `agentPrefix` to your project's slug (`kevin`
   for the command above). Keep `environment: "development"`.

3. Create a dedicated key in the dashboard's **API Keys** page. Kevin uses
   it to start sessions and subscribe to results. Dashboard keys have
   organization-wide access; storing one as a project secret does not
   narrow its scope. Save it in the gitignored `opencomputer/.env.local`:

   ```dotenv
   OPENCOMPUTER_API_KEY=<your-key>
   ```

   Upload the secret, check the project and deploy all three agents:

   ```bash
   npm run secret
   npm run check
   npm run deploy
   ```

4. Connect GitHub and select the repositories Kevin may work on:

   ```bash
   npx opencomputer github connect
   ```

5. In the dashboard, open **kevin → Development → Connections → lead →
   Create Slack bot**. Follow the [Slack setup](https://docs.opencomputer.dev/agents/slack)
   to create and authorize the bot using an App configuration access token.
   In your channel, `/invite @Kevin`, then mention it with a request and
   repository name. Its first response is a brief, before any code changes.

## Make it yours

- **Repository rules:** add `.agents/conventions.md` to the target repo
  ([template](templates/conventions.md)) to say which changes need a design,
  which can ship directly, and which checks to run.
- **Method and voice:** edit [`process/`](process/). These are instructions
  and examples the model adapts to the work, not a fixed sequence of forms.
  `npm run generate` copies this source into each agent's bundle.
- **Models and tools:** edit each `agent.ts` and the lead's
  [`tools/`](opencomputer/agents/lead/tools/). `maxImplementers` defaults to seven.
- **Documents elsewhere:** set `docsRepo` in `config.ts` to write documents
  to a separate repository's default branch.

Run `npm run check` and `npm run deploy` after changes. Deployment updates
the Development versions; existing sessions keep their deployed version.
Start a new Slack thread to try the updated lead.

For Production, set `environment: "production"` **before** running
`npm run secret` and `npm run deploy -- --alias production`, then connect
a separate Slack bot on the project's Production lead row.

## Limits and debugging

- **Stop is cooperative:** Kevin records the request and acts on the
  builder's next report; it does not interrupt a running command.
- **Reviews can be quiet for up to ten minutes.** Messages sent meanwhile
  are held for the lead's next reply. `consult` is not yet publicly documented;
  Kevin reports when review is unavailable.
- **Each thread has one owner.** Parallel Slack threads currently receive
  each other's builder outcomes and discard unrelated ones, adding model
  turns. A two-builder task normally involves a lead, two builders and a
  reviewer; retries and investigations add sessions.
- **Recovery has limits:** discovery needs the working branches and plan
  to remain on GitHub. A session whose computer failed to launch may need
  replacing with a new thread.

Inspect sessions in the dashboard or CLI:

```bash
npx opencomputer session list
npx opencomputer session inspect <session-id>
npx opencomputer logs --session <session-id>
```

[`DX-NOTES.md`](DX-NOTES.md) covers setup and platform gotchas.
`npm run check` verifies generated files, types, tests and `opencomputer doctor`
without starting agents.
