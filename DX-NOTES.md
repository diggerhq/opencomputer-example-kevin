# Gotchas

What tripped us up building this example, so it does not trip you. Versions:
`@opencomputer/agent` 0.9.0, `@opencomputer/cli` 0.7.16.

**A connection's `fetch` takes the absolute path, prefix included.** With
`pathPrefix: "/api/managed-agents/"`, a call reads
`opencomputer.fetch("/api/managed-agents/sessions", …)`. A relative path such
as `fetch("sessions", …)` throws "Connection requests require an absolute
path". The prefix is an allowlist, not a base URL.

**Declare secrets in `opencomputer/.env.example`, not a root `.env.example`.**
Doctor reads only `opencomputer/.env.example` and `opencomputer/.env.local`; a
secret used through `useSecret` but declared at the repository root fails
doctor with `secret_not_declared`.

**The CLI takes cloud agent ids, not the local names in `project.ts`.** The
first agent's cloud id is the project slug; the others are
`<slug>--<local id>`. Here: `kevin`, `kevin--implementer`, `kevin--reviewer`.
`opencomputer run lead …` answers "agent resource not found", and
`opencomputer session … --agent lead` answers "Agent lead is not unique",
which means the name does not exist.

**`opencomputer secrets set` refuses multi-agent projects.** Use
`npm run secret` (`scripts/set-secret.ts`), which reads `OPENCOMPUTER_API_KEY`
from `opencomputer/.env.local` and sets it through the management API.
`opencomputer deploy` does not check that the secret is set; a missing one
surfaces at the connection's first use.

**Tool ids passed to `useTool` must be string literals.** The CLI builds the
manifest from the literal ids in the agent source; `useTool(SHELL)` with a
constant is silently dropped and the tool is never offered.

**A project attached to a GitHub installation that no longer exists cannot
recover from the CLI.** Enable "Redirect on update" on the GitHub App, then
re-run `opencomputer github connect --new`.

**A session whose computer failed to launch keeps failing after the cause is
fixed.** Start a new session instead of sending to the old one.
