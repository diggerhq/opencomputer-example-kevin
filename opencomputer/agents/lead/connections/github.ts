import { defineConnection, githubApp } from "@opencomputer/agent";

/**
 * The project's GitHub App installation, as the lead uses it: documents and
 * integration branches (contents), the pull request (pull_requests). The
 * token is minted for this deployment and installed on the session's computer.
 */
export const github = defineConnection({
  id: "github",
  provider: githubApp({
    permissions: { contents: "write", pull_requests: "write", metadata: "read" },
  }),
});
