# opencomputer-example-kevin

- Layout: `opencomputer/project.ts` (project `kevin`, agents `lead`, `implementer`, `reviewer`); each agent under `opencomputer/agents/<id>/` with `agent.ts`, `connections/`, generated `process/`; the lead adds `config.ts` (project id, agent prefix, environment, `docsRepo`, `maxImplementers`) and `tools/`.
- `process/` at the root is the one source of shared text; `npm run generate` copies it into each agent's `process/` (an agent may import only inside its own directory). Edit the source, never the copies.
- `npm run check` = `generate --check` + typecheck + tests + `opencomputer doctor`; no platform needed. Green before every commit.
- `npm run generate` before every deploy (`npm run deploy` does both).
- One owner per file during the build (streams in work 040); touch only the files your stream owns.
- Invariants (design 019 §11): only the lead writes documents and talks to Slack; the lead never writes product code; implementers write only their `agent/<slug>--<stream>` branch; the reviewer never writes (read-only token, no code tools); agents reach each other only through the platform API, subscriptions and git; nothing merges a PR; no shared code, no npm packages in agents.
- `OPENCOMPUTER_API_KEY` lives only in the project secret; the `opencomputer` connection header is its only carrier. Never print it.
- Design: `serverless-agents-ws` `.agents/design/019-design-first-coder.md`; plan, gaps (`GAP(Kn)` comments) and build record: `.agents/work/040-kevin-build.md`.
- Never commit `.env`, `.env.local`, `.opencomputer/` or a secret. Never force-push; push with `git push origin HEAD:refs/heads/<branch>`.
