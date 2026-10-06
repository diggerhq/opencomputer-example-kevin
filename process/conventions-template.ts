/**
 * The text of templates/conventions.md, for an agent that writes the file
 * into a target repo (design 019 §7 "The docs location's conventions", §14
 * step 8). test/process.test.ts keeps the two identical.
 */

// 019 §4 "Process to fit", §7, §10 "Off switch", §14 step 8
export const CONVENTIONS_TEMPLATE = `# Conventions for Kevin

Kevin reads this file (\`.agents/conventions.md\`) before proposing the steps for a piece of work and before writing any document. Each section is a list of judgement hints, not rules; edit them to fit this repo. Without this file Kevin always proposes a design and a plan.

## Ship directly

Work Kevin may offer to build at once ("build now"), its design a paragraph of the PR description:

- One-line fixes, typos, copy changes.
- Dependency patch bumps with a green check run.
- Test-only changes that add coverage without changing behaviour.

## Always a plan first

Work that skips the design but gets a written plan (streams, checks, done-when) before any code:

- Changes touching more than one module or more than ~5 files.
- Refactors that keep behaviour (the plan names how behaviour is shown unchanged).
- Anything split across more than one builder.

## Needs a design

Work that gets a design document before a plan:

- New public API, CLI command, schema or data migration.
- Anything touching authentication, permissions, billing or secrets.
- Changes to how components talk to each other (new contracts, new boundaries).

## Building

How code lands in this repo:

- Check command: \`npm run check\` (change this to the repo's own).
- Documents: \`.agents/design/<slug>.md\` and \`.agents/work/<slug>.md\`; required header lines: none beyond Kevin's.
- Prompt capture: on (write \`off\` here to keep only the thread permalink).
- Never touch: \`migrations/\` applied history, generated files, lockfiles unless the stream is a dependency change.
`;
