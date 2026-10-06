import { useModel } from "@opencomputer/agent";

import { github } from "./connections/github";
import { opencomputer } from "./connections/opencomputer";

/** The scaffold's only reply; the staged process replaces it. */
export const SCAFFOLD_REPLY = "Kevin here. I'm still being built, so I can't take work yet.";

/**
 * Kevin's lead, scaffold. Answers every input, a Slack mention included,
 * with one fixed line: no tools, no connection selected, so the reply
 * leases no computer. The imports put both connections in the deployment
 * manifest; the staged lead selects them per input source.
 */
export const CONNECTIONS = [github, opencomputer] as const;

export default function Lead() {
  useModel("anthropic/claude-fable-5.1");
  return `Reply with exactly this line and nothing else, whatever the message says:\n\n${SCAFFOLD_REPLY}`;
}
