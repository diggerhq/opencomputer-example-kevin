# opencomputer-example-kevin

- `opencomputer/agents/{lead,implementer,reviewer}/`: three agents, one project (`opencomputer/project.ts`). `lead/config.ts` holds the project id, agent prefix and environment.
- `process/` is the one source for shared text; `npm run generate` copies it into each agent's `process/` (agents may import only inside their own directory). Never edit an agent's `process/` by hand.
- `npm run check` = `generate --check` + typecheck + tests + `opencomputer doctor`; no platform needed. Run it before every commit.
- Design and build record: `serverless-agents-ws`, design 019 and work 040.
- Never commit `.env`, `.env.local`, `.opencomputer/` or a secret. Never force-push.
