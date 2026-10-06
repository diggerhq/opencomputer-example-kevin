import { useModel } from "@opencomputer/agent";

import { github } from "./connections/github";
import { ROLES } from "./process/roles";

/** Puts the GitHub connection in the deployment manifest; the staged implementer selects it. */
export const CONNECTIONS = [github] as const;

/** Kevin's implementer, scaffold: its role and a fixed reply until assignments are wired. */
export default function Implementer() {
  useModel("anthropic/claude-opus-5.5");
  return `${ROLES.implementer}\n\nAssignments are not wired yet. Reply with one line: "Implementer ready; no assignment handling yet."`;
}
