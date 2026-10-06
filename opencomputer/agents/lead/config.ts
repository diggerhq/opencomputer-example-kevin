/**
 * The lead's deployment facts. A tool's context carries only the session,
 * agent and tool-call ids (GAP(K12)), so the project and environment the
 * lead delegates into are written here. A copy of this example changes
 * projectId and agentPrefix after `opencomputer link --create-project`.
 */
export const config = {
  /** The cloud project id, for management-API routes. */
  projectId: "prj_5e3b7f26e8b64079a91e92701750be40",
  /** The project's slug = the primary agent's cloud id; the others are `<agentPrefix>--<local id>`. */
  agentPrefix: "kevin",
  /** The environment sessions and subscriptions are created in. */
  environment: "development",
  /** When set (`owner/name`), documents go to this repo's default branch instead of the code repo's `agent/<slug>`. */
  docsRepo: undefined as string | undefined,
  /** At most this many implementers run at once. */
  maxImplementers: 7,
} as const;
