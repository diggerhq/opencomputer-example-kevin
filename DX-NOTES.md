# DX notes

Dated findings from building this example. Newest last.

## 2026-10-06: scaffold

Packages: `@opencomputer/agent` 0.9.0, `@opencomputer/cli` 0.7.16.

**A connection's `fetch` takes the absolute path, prefix included.** With
`pathPrefix: "/api/managed-agents/"`, a call reads
`opencomputer.fetch("/api/managed-agents/sessions", …)`. A relative path
such as `fetch("sessions", …)` throws "Connection requests require an
absolute path" (`@opencomputer/agent` `dist/index.js:371`). The prefix is an
allowlist, not a base URL; the declaration reads like a base URL, so the
relative form is the natural first guess.

**Connections reach the deployment manifest by being imported, and are
selected per render by `useConnection`.** The CLI builds the manifest from
the modules bundled for the agent (`@opencomputer/cli` `dist/project.js:2554`,
`prepareAgent`), so a connection defined in `connections/` but imported
nowhere is not deployed. The scaffold's agents export
`CONNECTIONS = [...]` to keep the import while selecting nothing
(`opencomputer/agents/lead/agent.ts:15`), which is how the lead's first reply
leases no computer. Declaration and selection are two separate acts with no
error when the first is missing.

**A secret must be declared in `opencomputer/.env.example`, not the root
`.env.example`.** Doctor reads only `opencomputer/.env.example` and
`opencomputer/.env.local` (`@opencomputer/cli` `dist/doctor.js:184-185`); a
secret referenced by `useSecret` and declared at the root is the error
`secret_not_declared` (`doctor.js:191`).

**Doctor warns about an unset local secret; deploy does not check the
deployed one.** With `OPENCOMPUTER_API_KEY` absent from
`opencomputer/.env.local`, doctor reports the warning
`development_secret_missing` (`doctor.js:200`), so `npm run check` passes
with one warning. `opencomputer deploy` succeeded with the project secret
unset; the failure surfaces only at the connection's first use. The warning's
hint names `opencomputer secrets set <name> --value-stdin`; whether that sets
the value the deployed connection reads is not yet checked.

**The CLI does not accept local agent ids.** In a project whose
`project.ts` lists `lead`, `implementer`, `reviewer`, the cloud ids are
`kevin`, `kevin--implementer`, `kevin--reviewer` (the first agent takes the
project slug). `opencomputer run lead …` answers "agent resource not found";
`opencomputer session … --agent lead` answers "Agent lead is not unique in
the current project. Available agents: kevin--reviewer, kevin--implementer,
kevin" (`@opencomputer/cli` `dist/session-command.js:73`). The name does not
exist rather than being ambiguous, so the wording points the wrong way, and
the id a person wrote in `project.ts` is not one the CLI takes.
