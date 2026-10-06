import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { config } from "../opencomputer/agents/lead/config";
import { commitDocument } from "../opencomputer/agents/lead/tools/commit-document";
import { delegate, idempotencyKey } from "../opencomputer/agents/lead/tools/delegate";
import { integrate } from "../opencomputer/agents/lead/tools/integrate";
import { cloneDir } from "../opencomputer/agents/lead/tools/lib/git";
import { parseImplementerReport, parseReviewerAnswer } from "../opencomputer/agents/lead/tools/lib/reports";
import { readState, renderState } from "../opencomputer/agents/lead/tools/lib/state";
import { openPr } from "../opencomputer/agents/lead/tools/open-pr";
import { whereAreWe } from "../opencomputer/agents/lead/tools/where-are-we";
import { TOOL_NAMES } from "../opencomputer/agents/lead/process/instructions";
import {
  LEAD_SESSION,
  localGitHub,
  notFound,
  ok,
  runTool,
  scriptGh,
  stubManagementApi,
} from "./lead-helpers";

const REPO = "acme/service";
const SLUG = "csv-export";
const PLAN = `.agents/work/${SLUG}.md`;
const SUBSCRIPTIONS = `/api/managed-agents/projects/${config.projectId}/event-subscriptions`;

function plan(state?: object, extra = ""): string {
  return `# CSV export\n\nversion: 4\nbase: main\n\n${state ? `${renderState(state as never)}\n\n` : ""}## Streams\n\n- api\n- web\n${extra}`;
}

function assignment(stream: string, extra: Record<string, unknown> = {}) {
  return {
    kind: "build",
    slug: SLUG,
    repo: REPO,
    stream,
    base: `agent/${SLUG}`,
    attempt: 1,
    files: [`src/${stream}.ts`],
    doneWhen: `${stream} exports CSV`,
    checks: "npm test",
    planUrl: `https://github.com/${REPO}/blob/agent/${SLUG}/${PLAN}#streams`,
    ...extra,
  };
}

test("tools register under the ids the process text calls", () => {
  assert.equal(whereAreWe.id, TOOL_NAMES.whereAreWe);
  assert.equal(delegate.id, TOOL_NAMES.delegate);
  assert.equal(commitDocument.id, TOOL_NAMES.commitDocument);
  assert.equal(integrate.id, TOOL_NAMES.integrate);
  assert.equal(openPr.id, TOOL_NAMES.openPr);
});

test("commit_document: creates agent/<slug>, writes, rewrites the state block and the version line, refuses other branches", async () => {
  const gh = await localGitHub();
  try {
    await gh.repo(REPO);
    const first = (await runTool(commitDocument, {
      repo: REPO,
      branch: `agent/${SLUG}`,
      path: PLAN,
      content: plan({ version: 4, leadSessionId: LEAD_SESSION, streams: [] }),
      message: "plan skeleton",
    })) as { sha: string; url: string };
    assert.equal(first.sha, gh.head(REPO, `agent/${SLUG}`));
    assert.equal(first.url, `https://github.com/${REPO}/blob/agent/${SLUG}/${PLAN}`);
    assert.equal(gh.show(REPO, `agent/${SLUG}`, "README.md"), "# service\n", "branched from main");

    await runTool(commitDocument, {
      repo: REPO,
      branch: `agent/${SLUG}`,
      path: PLAN,
      message: "state only",
      version: 5,
      state: { version: 4, streams: [{ stream: "api", attempt: 1, sessionId: "s-1", branch: `agent/${SLUG}--api`, state: "landed" }] },
    });
    const text = gh.show(REPO, `agent/${SLUG}`, PLAN) ?? "";
    assert.match(text, /^version: 5$/m);
    assert.deepEqual(readState(text), {
      version: 5,
      leadSessionId: LEAD_SESSION,
      streams: [{ stream: "api", attempt: 1, sessionId: "s-1", branch: `agent/${SLUG}--api`, state: "landed" }],
    });
    assert.match(text, /## Streams/, "prose kept");
    assert.equal(text.match(/```kevin-state/g)?.length, 1, "one state block");

    for (const branch of ["main", `agent/${SLUG}--api`]) {
      await assert.rejects(
        runTool(commitDocument, { repo: REPO, branch, path: PLAN, content: "x", message: "m" }),
        /documents go to agent\/<slug>/,
      );
    }
    await assert.rejects(
      runTool(commitDocument, { repo: REPO, branch: `agent/${SLUG}`, path: "../x.md", content: "x", message: "m" }),
      /path must be relative/,
    );
  } finally {
    await gh.cleanup();
  }
});

test("commit_document refuses a dirty clone (git status --porcelain)", async () => {
  const gh = await localGitHub();
  try {
    await gh.repo(REPO);
    await runTool(commitDocument, { repo: REPO, branch: `agent/${SLUG}`, path: PLAN, content: plan(), message: "plan" });
    await writeFile(join(cloneDir(REPO), "stray.txt"), "left behind\n");
    await assert.rejects(
      runTool(commitDocument, { repo: REPO, branch: `agent/${SLUG}`, path: PLAN, content: plan(), message: "again" }),
      /not clean \(git status --porcelain: \?\? stray\.txt\)/,
    );
  } finally {
    await gh.cleanup();
  }
});

test("delegate: subscription first, then sessions, then the state block, then turns; keys kevin:<lead>:<stream>:<attempt>", async () => {
  const gh = await localGitHub();
  const order: string[] = [];
  const api = stubManagementApi({
    onTurn: (sessionId) => {
      // State before any turn: the remote plan already names this session, running.
      const state = readState(gh.show(REPO, `agent/${SLUG}`, PLAN) ?? "");
      assert.ok(state?.streams.some((s) => s.sessionId === sessionId && s.state === "running"), `state names ${sessionId}`);
      assert.equal(state?.subscriptionId, "sub-1");
      order.push(`turn ${sessionId}`);
    },
  });
  try {
    await gh.repo(REPO);
    await gh.commit(REPO, `agent/${SLUG}`, { [PLAN]: plan({ version: 4, leadSessionId: LEAD_SESSION, streams: [] }) });

    const result = await runTool(delegate, { assignments: [assignment("api"), assignment("web")] });
    assert.deepEqual(result, {
      sessions: [
        { stream: "api", attempt: 1, sessionId: "impl-session-1" },
        { stream: "web", attempt: 1, sessionId: "impl-session-2" },
      ],
    });
    assert.deepEqual(
      api.calls.map((call) => `${call.method} ${call.path}${call.idempotencyKey ? ` [${call.idempotencyKey}]` : ""}`),
      [
        `GET ${SUBSCRIPTIONS}`,
        `POST ${SUBSCRIPTIONS}`,
        `POST /api/managed-agents/sessions [kevin:${LEAD_SESSION}:api:1]`,
        `POST /api/managed-agents/sessions [kevin:${LEAD_SESSION}:web:1]`,
        `POST /api/managed-agents/sessions/impl-session-1/turns [kevin:${LEAD_SESSION}:api:1:turn]`,
        `POST /api/managed-agents/sessions/impl-session-2/turns [kevin:${LEAD_SESSION}:web:1:turn]`,
      ],
    );
    assert.equal(idempotencyKey(LEAD_SESSION, "api", 1), `kevin:${LEAD_SESSION}:api:1`);
    assert.deepEqual(order, ["turn impl-session-1", "turn impl-session-2"]);
    assert.deepEqual(api.calls[1]?.body, {
      agentId: "kevin--implementer",
      events: ["turn.completed", "turn.failed", "turn.cancelled"],
      destination: { type: "session", sessionId: LEAD_SESSION },
      environment: "development",
    });
    assert.deepEqual(api.calls[2]?.body, { agentId: "kevin--implementer@development" });
    const turn = api.calls[4]?.body as { input: string; payload: Record<string, unknown>; mode: string };
    assert.equal(turn.mode, "queue");
    assert.deepEqual(turn.payload, { ...assignment("api"), branch: `agent/${SLUG}--api` });
    assert.match(turn.input, /^Build stream api of csv-export \(attempt 1\) in acme\/service on branch agent\/csv-export--api from base agent\/csv-export\. Done when: api exports CSV\. Checks: npm test\. Plan section: https:/);
    assert.equal(turn.input.split("\n").length, 1, "one paragraph");

    const state = readState(gh.show(REPO, `agent/${SLUG}`, PLAN) ?? "");
    assert.deepEqual(state, {
      version: 4,
      leadSessionId: LEAD_SESSION,
      subscriptionId: "sub-1",
      streams: [
        { stream: "api", attempt: 1, sessionId: "impl-session-1", branch: `agent/${SLUG}--api`, state: "running" },
        { stream: "web", attempt: 1, sessionId: "impl-session-2", branch: `agent/${SLUG}--web`, state: "running" },
      ],
    });

    // A retry reads the state first: no new session, the subscription reused, the turns replayed by key.
    api.calls.length = 0;
    await runTool(delegate, { assignments: [assignment("api")] });
    assert.deepEqual(
      api.calls.map((call) => `${call.method} ${call.idempotencyKey ?? call.path}`),
      [`GET ${SUBSCRIPTIONS}`, `POST kevin:${LEAD_SESSION}:api:1:turn`],
    );

    // A re-dispatch is attempt+1: a new key, a new session, the stream's entry replaced.
    api.calls.length = 0;
    await runTool(delegate, { assignments: [assignment("api", { attempt: 2 })] });
    assert.ok(api.calls.some((call) => call.idempotencyKey === `kevin:${LEAD_SESSION}:api:2`));
    const after = readState(gh.show(REPO, `agent/${SLUG}`, PLAN) ?? "");
    assert.deepEqual(after?.streams.map((s) => `${s.stream}@${s.attempt}`), ["api@2", "web@1"]);
  } finally {
    api.restore();
    await gh.cleanup();
  }
});

test("delegate: no session and no turn when the subscription cannot be made", async () => {
  const gh = await localGitHub();
  const api = stubManagementApi({
    fail: (call) => (call.method === "POST" && call.path === SUBSCRIPTIONS ? { status: 503, code: "unavailable" } : undefined),
  });
  try {
    await gh.repo(REPO);
    await gh.commit(REPO, `agent/${SLUG}`, { [PLAN]: plan({ version: 4, leadSessionId: LEAD_SESSION, streams: [] }) });
    await assert.rejects(runTool(delegate, { assignments: [assignment("api")] }), /answered 503 unavailable.*retrying the same call is safe/);
    assert.ok(!api.calls.some((call) => call.path.endsWith("/sessions") || call.path.endsWith("/turns")));
  } finally {
    api.restore();
    await gh.cleanup();
  }
});

test("delegate: an existing subscription is reused; an investigation before any plan writes the skeleton state first", async () => {
  const gh = await localGitHub();
  const api = stubManagementApi({
    subscriptions: [
      {
        id: "sub-existing",
        agentId: "kevin--implementer",
        events: ["turn.completed", "turn.failed", "turn.cancelled"],
        destination: { type: "session", sessionId: LEAD_SESSION },
        environment: "development",
      },
    ],
    onTurn: () => assert.ok(gh.show(REPO, `agent/${SLUG}`, PLAN)?.includes("investigate-auth")),
  });
  try {
    await gh.repo(REPO);
    const investigation = assignment("investigate-auth", { kind: "investigate", base: "main", files: [] });
    await runTool(delegate, { assignments: [investigation] });
    assert.ok(!api.calls.some((call) => call.method === "POST" && call.path === SUBSCRIPTIONS));
    const text = gh.show(REPO, `agent/${SLUG}`, PLAN) ?? "";
    assert.match(text, /^# csv-export\n\nversion: 1\n/);
    assert.deepEqual(readState(text), {
      version: 1,
      leadSessionId: LEAD_SESSION,
      subscriptionId: "sub-existing",
      streams: [{ stream: "investigate-auth", attempt: 1, sessionId: "impl-session-1", branch: "", state: "running" }],
    });
  } finally {
    api.restore();
    await gh.cleanup();
  }
});

test("delegate refuses more than maxImplementers and malformed assignments before any call", async () => {
  const api = stubManagementApi();
  try {
    const many = Array.from({ length: config.maxImplementers + 1 }, (_, i) => assignment(`s${i}`));
    await assert.rejects(runTool(delegate, { assignments: many }), /at most 7 implementers/);
    await assert.rejects(runTool(delegate, { assignments: [assignment("api", { branch: "main" })] }), /branch must be agent\/csv-export--/);
    await assert.rejects(
      runTool(delegate, { assignments: [assignment("api", { kind: "investigate", branch: "agent/csv-export--x" })] }),
      /read-only and has no branch/,
    );
    await assert.rejects(runTool(delegate, { assignments: [assignment("api"), assignment("api")] }), /each stream appears once/);
    assert.equal(api.calls.length, 0);
  } finally {
    api.restore();
  }
});

test("integrate: merges --no-ff and pushes; a conflict is aborted and reported as { stream, files, otherStream }", async () => {
  const gh = await localGitHub();
  try {
    await gh.repo(REPO, { "README.md": "# service\n", "src/shared.ts": "export const columns = [];\n" });
    await gh.commit(REPO, `agent/${SLUG}`, { [PLAN]: plan() });
    await gh.commit(REPO, `agent/${SLUG}--api`, { "src/api.ts": "api\n", "src/shared.ts": "export const columns = ['id'];\n" }, `agent/${SLUG}`);
    await gh.commit(REPO, `agent/${SLUG}--web`, { "src/web.ts": "web\n", "src/shared.ts": "export const columns = ['name'];\n" }, `agent/${SLUG}`);

    const merged = (await runTool(integrate, { repo: REPO, slug: SLUG, stream: "api" })) as { merged: boolean; sha: string };
    assert.equal(merged.merged, true);
    assert.equal(gh.head(REPO, `agent/${SLUG}`), merged.sha);
    assert.equal(gh.parents(REPO, `agent/${SLUG}`).length, 2, "a merge commit (--no-ff)");
    assert.equal(gh.show(REPO, `agent/${SLUG}`, "src/api.ts"), "api\n");

    const before = gh.head(REPO, `agent/${SLUG}`);
    const conflict = await runTool(integrate, { repo: REPO, slug: SLUG, stream: "web" });
    assert.deepEqual(conflict, { merged: false, conflict: { stream: "web", files: ["src/shared.ts"], otherStream: "api" } });
    assert.equal(gh.head(REPO, `agent/${SLUG}`), before, "nothing pushed");

    // The aborted merge leaves the clone clean, so the next call is not refused.
    const again = (await runTool(integrate, { repo: REPO, slug: SLUG, stream: "api" })) as { alreadyMerged: boolean };
    assert.equal(again.alreadyMerged, true);
  } finally {
    await gh.cleanup();
  }
});

test("integrate refuses a dirty clone before merging", async () => {
  const gh = await localGitHub();
  try {
    await gh.repo(REPO);
    await gh.commit(REPO, `agent/${SLUG}`, { [PLAN]: plan() });
    await gh.commit(REPO, `agent/${SLUG}--api`, { "src/api.ts": "api\n" }, `agent/${SLUG}`);
    await runTool(integrate, { repo: REPO, slug: SLUG, stream: "api" });
    await writeFile(join(cloneDir(REPO), "README.md"), "edited by hand\n");
    const before = gh.head(REPO, `agent/${SLUG}`);
    await assert.rejects(runTool(integrate, { repo: REPO, slug: SLUG, stream: "api" }), /git status --porcelain:  ?M README\.md/);
    assert.equal(gh.head(REPO, `agent/${SLUG}`), before);
  } finally {
    await gh.cleanup();
  }
});

test("open_pr: gh pr create --draft with the body file, then deletes the subscription; ready → gh pr ready", async () => {
  const api = stubManagementApi({
    subscriptions: [
      {
        id: "sub-7",
        agentId: "kevin--implementer",
        events: ["turn.completed"],
        destination: { type: "session", sessionId: LEAD_SESSION },
        environment: "development",
      },
      {
        id: "sub-other",
        agentId: "kevin--implementer",
        events: ["turn.completed"],
        destination: { type: "session", sessionId: "another-thread" },
        environment: "development",
      },
    ],
  });
  let body = "";
  let draft = true;
  const gh = scriptGh(async (args) => {
    if (args[0] === "pr" && args[1] === "create") {
      const { readFile } = await import("node:fs/promises");
      body = await readFile(args[args.indexOf("--body-file") + 1] as string, "utf8");
      return ok("https://github.com/acme/service/pull/12\n");
    }
    if (args[0] === "pr" && args[1] === "ready") {
      draft = false;
      return ok("");
    }
    if (args[0] === "pr" && args[1] === "view") return ok({ number: 12, url: "https://github.com/acme/service/pull/12", isDraft: draft });
    return notFound();
  });
  try {
    const opened = await runTool(openPr, { repo: REPO, slug: SLUG, base: "main", title: "CSV export", body: "## What\nCSV." });
    assert.deepEqual(opened, { number: 12, url: "https://github.com/acme/service/pull/12", draft: true, subscriptionsDeleted: 1 });
    const create = gh.calls[0]?.args ?? [];
    assert.deepEqual(create.slice(0, 11), ["pr", "create", "--draft", "--repo", REPO, "--base", "main", "--head", `agent/${SLUG}`, "--title", "CSV export"]);
    assert.equal(create[11], "--body-file");
    assert.equal(body, "## What\nCSV.");
    assert.deepEqual(api.subscriptions.map((s) => s.id), ["sub-other"], "only this session's subscription goes");

    const ready = await runTool(openPr, { repo: REPO, slug: SLUG, ready: true });
    assert.deepEqual(ready, { number: 12, url: "https://github.com/acme/service/pull/12", draft: false, subscriptionsDeleted: 0 });
    assert.ok(gh.calls.some((call) => call.args.join(" ") === `pr ready agent/${SLUG} --repo ${REPO}`));
    await assert.rejects(runTool(openPr, { repo: REPO, slug: SLUG, base: "main" }), /needs base, title and body/);
  } finally {
    gh.restore();
    api.restore();
  }
});

/** A scripted GitHub for where_are_we: one repo, its agent/* refs, the plan, a PR, compares, commits. */
function githubFor(state: object, options: { running?: boolean } = {}) {
  const planText = plan(state, "\n## Prompts\n\n> add CSV export\n");
  const encoded = (text: string) => ({ content: Buffer.from(text).toString("base64"), encoding: "base64" });
  return scriptGh((args) => {
    const path = args[1] ?? "";
    if (path === "installation/repositories?per_page=100") return ok({ repositories: [{ full_name: "acme/other" }, { full_name: REPO }] });
    if (path === "repos/acme/other/git/matching-refs/heads/agent/?per_page=100") return ok([]);
    if (path === `repos/${REPO}`) return ok({ default_branch: "main" });
    if (path === `repos/${REPO}/git/matching-refs/heads/agent/?per_page=100`) {
      return ok([
        { ref: "refs/heads/agent/older-work", object: { sha: "a0" } },
        { ref: `refs/heads/agent/${SLUG}`, object: { sha: "a1" } },
        { ref: `refs/heads/agent/${SLUG}--api`, object: { sha: "a2" } },
        { ref: `refs/heads/agent/${SLUG}--web`, object: { sha: "a3" } },
      ]);
    }
    if (path === `repos/${REPO}/contents/.agents/work/older-work.md?ref=agent%2Folder-work`) {
      return ok(encoded(plan({ version: 2, leadSessionId: "someone-else", streams: [] })));
    }
    if (path === `repos/${REPO}/contents/${PLAN}?ref=agent%2F${SLUG}`) return ok(encoded(planText));
    if (path === `repos/${REPO}/contents/.agents/design/${SLUG}.md?ref=agent%2F${SLUG}`) return ok(encoded("# design\n"));
    if (path.startsWith(`repos/${REPO}/pulls?head=acme%3Aagent%2F${SLUG}`)) {
      return ok([{ number: 12, draft: true, merged_at: null, html_url: "https://github.com/acme/service/pull/12" }]);
    }
    if (path === `repos/${REPO}/compare/agent/${SLUG}...agent/${SLUG}--api`) return ok({ ahead_by: 0 });
    if (path === `repos/${REPO}/compare/agent/${SLUG}...agent/${SLUG}--web`) return ok({ ahead_by: options.running ? 2 : 0 });
    if (path === `repos/${REPO}/commits?sha=agent%2F${SLUG}&per_page=5`) {
      return ok([{ sha: "c1", commit: { message: "Merge stream api into agent/csv-export\n\nbody" } }]);
    }
    return notFound();
  });
}

test("where_are_we: finds the work by session id across granted repos and returns the documented shape", async () => {
  const state = {
    version: 4,
    leadSessionId: LEAD_SESSION,
    threadId: "1759750000.000100",
    subscriptionId: "sub-1",
    streams: [
      { stream: "api", attempt: 1, sessionId: "impl-1", branch: `agent/${SLUG}--api`, state: "merged" },
      { stream: "web", attempt: 2, sessionId: "impl-2", branch: `agent/${SLUG}--web`, state: "running" },
    ],
  };
  const gh = githubFor(state, { running: true });
  const api = stubManagementApi();
  try {
    const result = await runTool(whereAreWe, {});
    assert.deepEqual(result, {
      slug: SLUG,
      repo: REPO,
      branch: `agent/${SLUG}`,
      base: "main",
      version: 4,
      docs: {
        design: `https://github.com/${REPO}/blob/agent/${SLUG}/.agents/design/${SLUG}.md`,
        plan: `https://github.com/${REPO}/blob/agent/${SLUG}/${PLAN}`,
        prompts: `https://github.com/${REPO}/blob/agent/${SLUG}/${PLAN}#prompts`,
      },
      pr: { number: 12, draft: true, merged: false, url: "https://github.com/acme/service/pull/12" },
      streams: [
        { name: "api", branch: `agent/${SLUG}--api`, merged: true, sessionId: "impl-1", attempt: 1, state: "merged" },
        { name: "web", branch: `agent/${SLUG}--web`, merged: false, sessionId: "impl-2", attempt: 2, state: "running" },
      ],
      lastCommits: [{ sha: "c1", subject: "Merge stream api into agent/csv-export" }],
      state,
    });
    assert.equal(api.calls.length, 0, "a running stream keeps the subscription");
    assert.ok(gh.calls.every((call) => call.args[0] === "api"), "gh api only: no clone");

    // Another session of the same thread finds it by thread id.
    const byThread = (await runTool(whereAreWe, { repo: REPO, threadId: "1759750000.000100" }, "teammate-session")) as { slug?: string };
    assert.equal(byThread.slug, SLUG);
  } finally {
    gh.restore();
    api.restore();
  }
});

test("where_are_we: nothing running → deletes the outcome subscription; no work → slugs in use", async () => {
  const state = {
    version: 6,
    leadSessionId: LEAD_SESSION,
    subscriptionId: "sub-1",
    streams: [{ stream: "api", attempt: 1, sessionId: "impl-1", branch: `agent/${SLUG}--api`, state: "merged" }],
  };
  const gh = githubFor(state);
  const api = stubManagementApi({
    subscriptions: [
      {
        id: "sub-1",
        agentId: "kevin--implementer",
        events: ["turn.completed"],
        destination: { type: "session", sessionId: LEAD_SESSION },
        environment: "development",
      },
    ],
  });
  try {
    const result = (await runTool(whereAreWe, { repo: REPO })) as Record<string, unknown>;
    assert.equal(result.subscriptionDeleted, true);
    assert.equal(api.subscriptions.length, 0);
    assert.deepEqual(
      (result.streams as Array<{ name: string; state: string }>).map((s) => `${s.name}:${s.state}`),
      ["api:merged", "web:unrecorded"],
    );

    const none = await runTool(whereAreWe, { repo: REPO }, "a-new-session");
    assert.deepEqual(none, {
      repo: REPO,
      base: "main",
      version: 0,
      docs: {},
      streams: [],
      lastCommits: [],
      slugsInUse: ["older-work", SLUG],
    });
  } finally {
    gh.restore();
    api.restore();
  }
});

test("parsers: implementer report = first fenced block; reviewer answer skips the wrapper line", () => {
  const report = { landed: [], checks: { status: "fail", tail: "1 failing" }, blocked: ["needs a key"], planAmendments: [] };
  assert.deepEqual(parseImplementerReport(`notes\n\`\`\`json\n${JSON.stringify(report)}\n\`\`\`\n\`\`\`json\n{}\n\`\`\``), {
    status: "reported",
    report,
  });
  assert.deepEqual(parseImplementerReport('```json\n{ "landed": "yes" }\n```'), {
    status: "blocked",
    reason: "landed must be [{ sha, subject }]",
    tail: '```json\n{ "landed": "yes" }\n```',
  });
  assert.equal(parseImplementerReport("```json\n{ nope\n```").status, "blocked");

  assert.deepEqual(parseReviewerAnswer('Agent kevin--reviewer answered:\n```json\n{ "verdict": "ship", "findings": [] }\n```'), {
    verdict: "ship",
    findings: [],
    available: true,
    unsettled: false,
  });
  const prose = parseReviewerAnswer("Agent kevin--reviewer answered:\nLooks fine to me.");
  assert.equal(prose.verdict, "fix-first");
  assert.equal(prose.findings[0]?.scenario, "reviewer unavailable: Looks fine to me.");
  const failed = parseReviewerAnswer("Agent kevin--reviewer could not answer: the turn failed (boom).");
  assert.equal(failed.findings[0]?.scenario, "reviewer unavailable: Agent kevin--reviewer could not answer: the turn failed (boom).");
  assert.equal(failed.unsettled, false);
});
