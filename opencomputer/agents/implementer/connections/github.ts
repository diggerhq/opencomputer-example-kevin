import { defineConnection, githubApp } from "@opencomputer/agent";

/** Push to its own stream branch (contents); read pull requests, never write them. */
export const github = defineConnection({
  id: "github",
  provider: githubApp({
    permissions: { contents: "write", pull_requests: "read" },
  }),
});
