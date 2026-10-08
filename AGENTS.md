# opencomputer-example-kevin

- Layout: `opencomputer/project.ts` (project `kevin`, agents `lead`, `implementer`, `reviewer`); each agent under `opencomputer/agents/<id>/` with `agent.ts`, `connections/`, generated `process/`; the lead adds `config.ts` (project id, agent prefix, environment, `docsRepo`, `maxImplementers`) and `tools/`.
- `process/` at the root is the one source of shared text: `roles.ts` (each role's identity), the lead's `facts.ts`, `values.ts`, `boundaries.ts` and `method.ts` (the method as a skill), joined in `instructions.ts`; `implementer.ts`, `reviewer.ts` and `reports.ts` (contracts the code parses). `npm run generate` copies it into each agent's `process/` (an agent may import only inside its own directory). Edit the source, never the copies.
- `npm run check` = `generate --check` + typecheck + tests + `opencomputer doctor`; no platform needed. Green before every commit.
- After `opencomputer link`, update `projectId` and `agentPrefix` in the lead's `config.ts`; `test/config.test.ts` fails when they drift.
- `npm run generate` before every deploy (`npm run deploy` does both).
- Work on `main` directly: commit, `npm run check` green, push with `git push origin HEAD:refs/heads/main`.
- Public docs explain use, architecture and customization. Keep limitations that affect users; leave build progress, validation diaries, internal plans and documentation rollout status in the owning knowledge-repo work doc.
- Invariants: only the lead writes documents and talks to Slack; the lead never writes product code; implementers write only their `agent/<slug>--<stream>` branch; the reviewer never writes (read-only token, no code tools); agents reach each other only through the platform API, subscriptions and git; nothing merges a PR; no shared code, no npm packages in agents.
- `OPENCOMPUTER_API_KEY` lives only in the project secret; the lead's `management-api` connection header is its only carrier. Set it with `npm run secret` (reads `opencomputer/.env.local`). Never print it.
- Never commit `.env`, `.env.local`, `.opencomputer/` or a secret. Never force-push.
