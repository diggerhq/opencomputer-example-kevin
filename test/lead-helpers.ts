/**
 * Test doubles for the lead's tools: local bare git repositories standing in
 * for GitHub remotes, a scripted `gh`, and the management API behind the
 * `opencomputer` connection's egress (the shape `defineConnection().fetch`
 * sends). No network, no platform.
 */
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { ToolDefinition } from "@opencomputer/agent";

import { type ExecResult, realExec, runtime } from "../opencomputer/agents/lead/tools/lib/exec";

export const LEAD_SESSION = "lead-session-1";

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args], {
    cwd,
    encoding: "utf8",
  });

/** Bare repositories under a temp dir, wired in as the tools' remotes; clones go beside them. */
export async function localGitHub(): Promise<{
  root: string;
  /** A bare repo with `main` holding these files. */
  repo: (name: string, files?: Record<string, string>) => Promise<void>;
  /** Commits files on `branch` (created from `from` when missing) straight to the remote. */
  commit: (name: string, branch: string, files: Record<string, string>, from?: string) => Promise<string>;
  /** A file on a remote branch, or null. */
  show: (name: string, branch: string, path: string) => string | null;
  /** A remote branch's head sha, or null. */
  head: (name: string, branch: string) => string | null;
  /** Parents of a remote branch's head. */
  parents: (name: string, branch: string) => string[];
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), "kevin-lead-"));
  const remotes = join(root, "remotes");
  const saved = { cloneRoot: runtime.cloneRoot, remoteBase: runtime.remoteBase };
  runtime.cloneRoot = join(root, "clones");
  runtime.remoteBase = `${remotes}/`;
  const bare = (name: string) => join(remotes, `${name}.git`);
  let scratch = 0;
  const commit = async (name: string, branch: string, files: Record<string, string>, from = "main") => {
    const work = join(root, `scratch-${(scratch += 1)}`);
    git(root, "clone", "--quiet", bare(name), work);
    const exists = git(work, "ls-remote", "--heads", "origin", branch).trim() !== "";
    git(work, "checkout", "--quiet", "-B", branch, exists ? `origin/${branch}` : `origin/${from}`);
    for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(work, path)), { recursive: true });
      await writeFile(join(work, path), content);
    }
    git(work, "add", "-A");
    git(work, "commit", "--quiet", "-m", `test: ${branch} ${Object.keys(files).join(" ")}`);
    git(work, "push", "--quiet", "origin", `HEAD:refs/heads/${branch}`);
    const sha = git(work, "rev-parse", "HEAD").trim();
    await rm(work, { recursive: true, force: true });
    return sha;
  };
  const tryGit = (name: string, ...args: string[]) => {
    try {
      return execFileSync("git", ["--git-dir", bare(name), ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      return null;
    }
  };
  return {
    root,
    repo: async (name, files = { "README.md": "# service\n" }) => {
      await mkdir(dirname(bare(name)), { recursive: true });
      execFileSync("git", ["init", "--quiet", "--bare", "--initial-branch=main", bare(name)]);
      const work = join(root, `seed-${name.replace("/", "-")}`);
      await mkdir(work, { recursive: true });
      git(work, "init", "--quiet", "--initial-branch=main");
      for (const [path, content] of Object.entries(files)) {
        await mkdir(dirname(join(work, path)), { recursive: true });
        await writeFile(join(work, path), content);
      }
      git(work, "add", "-A");
      git(work, "commit", "--quiet", "-m", "seed");
      git(work, "push", "--quiet", bare(name), "HEAD:refs/heads/main");
      await rm(work, { recursive: true, force: true });
    },
    commit,
    show: (name, branch, path) => tryGit(name, "show", `${branch}:${path}`),
    head: (name, branch) => tryGit(name, "rev-parse", `refs/heads/${branch}`)?.trim() ?? null,
    parents: (name, branch) => (tryGit(name, "rev-list", "--parents", "-n", "1", branch) ?? "").trim().split(" ").slice(1),
    cleanup: async () => {
      runtime.cloneRoot = saved.cloneRoot;
      runtime.remoteBase = saved.remoteBase;
      await rm(root, { recursive: true, force: true });
    },
  };
}

export interface GhCall {
  args: string[];
}

/** Answers `gh` from `handler`; `git` and everything else run for real. Returns the calls and a restore. */
export function scriptGh(handler: (args: string[]) => ExecResult | Promise<ExecResult>): { calls: GhCall[]; restore: () => void } {
  const calls: GhCall[] = [];
  runtime.exec = async (command, args, options) => {
    if (command !== "gh") return realExec(command, args, options);
    calls.push({ args: [...args] });
    return handler([...args]);
  };
  return { calls, restore: () => void (runtime.exec = realExec) };
}

export const ok = (value: unknown): ExecResult => ({
  code: 0,
  stdout: typeof value === "string" ? value : JSON.stringify(value),
  stderr: "",
});
export const notFound = (): ExecResult => ({ code: 1, stdout: "", stderr: "gh: Not Found (HTTP 404)" });

export interface ApiCall {
  method: string;
  path: string;
  idempotencyKey?: string;
  body?: unknown;
}

interface Subscription {
  id: string;
  agentId: string;
  events: string[];
  destination: { type: string; sessionId: string };
  environment: string;
  sourceLabels?: Record<string, string>;
}

/**
 * The management API behind the connection egress. Sessions and turns are
 * idempotent by key, as the platform documents; `fail` makes one route answer
 * an error; `onTurn` runs before a turn is admitted (to look at the remote).
 */
export function stubManagementApi(options: {
  subscriptions?: Subscription[];
  fail?: (call: ApiCall) => { status: number; code: string } | undefined;
  onTurn?: (sessionId: string, call: ApiCall) => void | Promise<void>;
} = {}) {
  const calls: ApiCall[] = [];
  const subscriptions = [...(options.subscriptions ?? [])];
  const sessionsByKey = new Map<string, string>();
  const turnsByKey = new Map<string, string>();
  const original = globalThis.fetch;
  process.env.OPENCOMPUTER_CONNECTIONS_URL = "https://connections.test";
  process.env.OPENCOMPUTER_CONNECTION_TOKEN = "runtime-token";
  const json = (status: number, value?: unknown) =>
    new Response(value === undefined ? null : JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    });
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url) !== "https://connections.test/management-api/fetch") throw new Error(`unexpected fetch ${String(url)}`);
    const request = JSON.parse(String(init?.body)) as {
      method: string;
      path: string;
      headers: Record<string, string>;
      body?: string;
    };
    const call: ApiCall = {
      method: request.method,
      path: request.path,
      ...(request.headers["idempotency-key"] ? { idempotencyKey: request.headers["idempotency-key"] } : {}),
      ...(request.body === undefined ? {} : { body: JSON.parse(request.body) as unknown }),
    };
    calls.push(call);
    const failure = options.fail?.(call);
    if (failure) return json(failure.status, { error: { code: failure.code, message: "stubbed failure" } });
    const subscriptionRoute = request.path.match(/^\/api\/managed-agents\/projects\/[^/]+\/event-subscriptions(?:\/([^/]+))?$/);
    if (subscriptionRoute) {
      const id = subscriptionRoute[1];
      if (request.method === "GET" && !id) return json(200, { subscriptions });
      if (request.method === "POST" && !id) {
        const subscription = { id: `sub-${subscriptions.length + 1}`, ...(call.body as Omit<Subscription, "id">) };
        subscriptions.push(subscription);
        return json(201, { subscription });
      }
      if (request.method === "DELETE" && id) {
        const index = subscriptions.findIndex((subscription) => subscription.id === decodeURIComponent(id));
        if (index < 0) return json(404, { error: { code: "event_subscription_not_found", message: "gone" } });
        subscriptions.splice(index, 1);
        return new Response(null, { status: 204 });
      }
    }
    if (request.method === "POST" && request.path === "/api/managed-agents/sessions") {
      const key = call.idempotencyKey ?? `anon-${calls.length}`;
      const existing = sessionsByKey.get(key);
      if (existing) return json(200, { session: { id: existing } });
      const id = `impl-session-${sessionsByKey.size + 1}`;
      sessionsByKey.set(key, id);
      return json(201, { session: { id } });
    }
    const turnRoute = request.path.match(/^\/api\/managed-agents\/sessions\/([^/]+)\/turns$/);
    if (request.method === "POST" && turnRoute?.[1]) {
      const key = call.idempotencyKey ?? `anon-${calls.length}`;
      const existing = turnsByKey.get(key);
      if (existing) return json(200, { turnId: existing, status: "running", duplicate: true });
      await options.onTurn?.(decodeURIComponent(turnRoute[1]), call);
      const turnId = `turn-${turnsByKey.size + 1}`;
      turnsByKey.set(key, turnId);
      return json(202, { turnId, status: "queued", duplicate: false });
    }
    return json(404, { error: "no such route" });
  }) as typeof fetch;
  return {
    calls,
    subscriptions,
    restore: () => {
      globalThis.fetch = original;
      delete process.env.OPENCOMPUTER_CONNECTIONS_URL;
      delete process.env.OPENCOMPUTER_CONNECTION_TOKEN;
    },
  };
}

/** Calls a tool's run() the way the host does, as the lead session. */
export async function runTool(tool: ToolDefinition, input: Record<string, unknown>, sessionId = LEAD_SESSION): Promise<unknown> {
  return tool.run({
    input,
    sessionId,
    messageId: "message-1",
    toolCallId: "call-1",
    agentId: "kevin",
    reportProgress: async () => undefined,
  });
}
