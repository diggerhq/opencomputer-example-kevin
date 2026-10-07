/**
 * The lead's tool telemetry (opencomputer/agents/lead/tools/lib/telemetry.ts):
 * what reaches the session's event log, what the model is told on a failure,
 * and that no credential leaks into either.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ApiError } from "../opencomputer/agents/lead/tools/lib/api";
import { realExec } from "../opencomputer/agents/lead/tools/lib/exec";
import { describeFailure, emit, scrub, traced } from "../opencomputer/agents/lead/tools/lib/telemetry";

type Record = { [key: string]: string | number | boolean | null };

function recorder() {
  const records: Record[] = [];
  return { records, context: { reportProgress: async (metadata: Record) => void records.push(metadata) } };
}

const TOKEN = "ghs_" + "a".repeat(36);

test("scrub redacts GitHub tokens and keeps the end of output or the start of a message", () => {
  assert.equal(scrub(`clone https://x-access-token:${TOKEN}@github.com/acme/service`), "clone https://[redacted]@github.com/acme/service");
  assert.ok(!scrub(`token=${TOKEN}`).includes(TOKEN));
  assert.equal(scrub("abcdef", 3), "…def");
  assert.equal(scrub("abcdef", 3, "start"), "abc…");
});

test("describeFailure: management API statuses, GitHub causes, network, our own input checks", () => {
  assert.equal(describeFailure(new ApiError(401, "unauthorized", "no")).kind, "api_auth");
  assert.match(describeFailure(new ApiError(403, undefined, "no")).summary, /OPENCOMPUTER_API_KEY/);
  assert.equal(describeFailure(new ApiError(503, undefined, "down")).kind, "api_unavailable");
  assert.equal(describeFailure(new ApiError(409, "conflict", "already exists")).kind, "api_rejected");
  assert.equal(describeFailure(new Error("gh api repos/a/b failed (exit 1): HTTP 401: Bad credentials")).kind, "github_auth");
  assert.equal(describeFailure(new Error("HTTP 403: Resource not accessible by integration")).kind, "github_forbidden");
  assert.equal(describeFailure(new Error("gh api failed: HTTP 404: Not Found")).kind, "github_not_found");
  assert.equal(describeFailure(new Error("getaddrinfo ENOTFOUND api.github.com")).kind, "network");
  assert.deepEqual(describeFailure(new Error("assignment.slug is required")), { kind: "input", summary: "assignment.slug is required" });
  assert.equal(describeFailure(new Error("gh could not start: spawn gh ENOENT")).kind, "command_missing");
});

test("traced: start, inner records and success reach the event log under the tool's name", async () => {
  const { records, context } = recorder();
  const output = await traced("where_are_we", context, { repo: "acme/service" }, async () => {
    await emit({ event: "api", method: "GET", path: "/sessions", status: 200, ms: 3 });
    return { ok: true };
  });
  assert.deepEqual(output, { ok: true });
  assert.deepEqual(
    records.map((record) => [record.tool, record.event]),
    [
      ["where_are_we", "tool_started"],
      ["where_are_we", "api"],
      ["where_are_we", "tool_succeeded"],
    ],
  );
  assert.equal(records[0]!.input, '{"repo":"acme/service"}');
});

test("traced: a failure is logged in full and rethrown as one short sentence without the credential", async () => {
  const { records, context } = recorder();
  await assert.rejects(
    traced("integrate", context, {}, async () => {
      throw new Error(`git push https://x-access-token:${TOKEN}@github.com/acme/service failed: HTTP 403: Resource not accessible by integration`);
    }),
    (error: Error) => {
      assert.match(error.message, /^integrate failed: GitHub refused the operation; .*installation/);
      assert.ok(!error.message.includes(TOKEN));
      return true;
    },
  );
  const failed = records.find((record) => record.event === "tool_failed")!;
  assert.equal(failed.kind, "github_forbidden");
  assert.match(String(failed.detail), /Resource not accessible by integration/);
  assert.ok(!String(failed.detail).includes(TOKEN));
});

test("traced: a reporter that throws never breaks the tool", async () => {
  const context = { reportProgress: async () => Promise.reject(new Error("event log unavailable")) };
  assert.equal(await traced("open_pr", context, {}, async () => 7), 7);
});

test("realExec writes one record per command: exit code, duration, and the error tail on failure", async () => {
  const { records, context } = recorder();
  await traced("commit_document", context, {}, async () => {
    const ok = await realExec(process.execPath, ["-e", "process.stdout.write('hi')"]);
    assert.equal(ok.code, 0);
    const bad = await realExec(process.execPath, ["-e", "process.stderr.write('boom'); process.exit(3)"]);
    assert.equal(bad.code, 3);
  });
  const execs = records.filter((record) => record.event === "exec");
  assert.equal(execs.length, 2);
  assert.equal(execs[0]!.code, 0);
  assert.equal(execs[0]!.stderr, undefined);
  assert.equal(execs[1]!.code, 3);
  assert.equal(execs[1]!.stderr, "boom");
  assert.equal(typeof execs[1]!.ms, "number");
});
