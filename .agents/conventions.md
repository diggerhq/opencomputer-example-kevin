# Conventions for Kevin

Kevin reads this file (`.agents/conventions.md`) before proposing the steps for a piece of work and before writing any document. Each section is a list of judgement hints, not rules; edit them to fit this repo. Without this file Kevin always proposes a design and a plan.

## Ship directly

Work Kevin may offer to build at once ("build now"), its design a paragraph of the PR description:

- `README.md`, `DX-NOTES.md`, `docs/`: wording, diagrams, setup steps.
- `templates/`.
- `scripts/`: generate, secret, diagram.
- Test-only changes that add coverage without changing behaviour.

## Always a plan first

Work that skips the design but gets a written plan (streams, checks, done-when) before any code:

- Changes touching more than one module or more than ~5 files.
- Refactors that keep behaviour (the plan names how behaviour is shown unchanged).
- Anything split across more than one builder.

## Needs a design

Work that gets a design document before a plan:

- `process/*.ts` (the agents' instruction text) and `opencomputer/agents/*/agent.ts`: they change behaviour that shows only after a deploy, in live threads, so the design names which threads will show it and what a reader of those threads should see change.
- Anything touching connections, permissions or secrets.
- Changes to how the agents talk to each other (new contracts, new boundaries).

## Building

How code lands in this repo:

- Check command: `NODE_ENV=development npm ci --include=dev && npm run check`.
- Documents: `.agents/design/<slug>.md` and `.agents/work/<slug>.md` on `agent/<slug>`; required header lines: none beyond Kevin's.
- Pull requests: one per thread, opened as a draft first.
- Prompt capture: on.
- Never touch: the generated copies under `opencomputer/agents/*/process/` (edit `process/`, then `npm run generate`), `package-lock.json` unless the stream is a dependency change, `.env*`, `.opencomputer/`.
