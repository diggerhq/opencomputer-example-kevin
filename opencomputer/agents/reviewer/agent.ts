import { useModel } from "@opencomputer/agent";

import { github } from "./connections/github";
import { ROLES } from "./process/roles";

/** Puts the read-only GitHub connection in the deployment manifest; the staged reviewer selects it. */
export const CONNECTIONS = [github] as const;

/** Kevin's reviewer, scaffold: its role and a fixed reply until briefs are wired. */
export default function Reviewer() {
  useModel("anthropic/claude-fable-5.1");
  return `${ROLES.reviewer}\n\nBriefs are not wired yet. Reply with one line: "Reviewer ready; no brief handling yet."`;
}
