import { defineConnection, githubApp } from "@opencomputer/agent";

/** Read only: the reviewer's token cannot write, whatever its shell is asked. */
export const github = defineConnection({
  id: "github",
  provider: githubApp({
    permissions: { contents: "read", pull_requests: "read", metadata: "read" },
  }),
});
