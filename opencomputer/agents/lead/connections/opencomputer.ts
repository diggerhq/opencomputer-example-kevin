import { defineConnection, secretHeader, useSecret } from "@opencomputer/agent";

/**
 * The OpenComputer management API, for fan-out (sessions, turns, event
 * subscriptions). The API authenticates with `x-api-key`; the key is a
 * project-scoped API key stored as the project secret OPENCOMPUTER_API_KEY
 * and attached at the edge, never on the computer. Requests take the full
 * path: `opencomputer.fetch("/api/managed-agents/sessions", …)`.
 */
export const opencomputer = defineConnection({
  id: "management-api",
  origin: "https://app.opencomputer.dev",
  pathPrefix: "/api/managed-agents/",
  methods: ["GET", "POST", "DELETE"],
  headers: {
    "x-api-key": secretHeader(useSecret("OPENCOMPUTER_API_KEY")),
  },
});
