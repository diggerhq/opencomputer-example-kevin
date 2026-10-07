/**
 * What the lead's tools leave behind for debugging, and how their failures
 * read to the model.
 *
 * Every tool runs inside `traced`: each command, API call and the tool's own
 * outcome is written to the session's event log as a `tool.progress` event
 * (`opencomputer sessions tail <session-id>`), with durations, exit codes and
 * the tail of any error output. A failure is rethrown as one short message
 * the model can relay: what failed, the likely cause, what to do next. The
 * raw detail stays in the event log, never in the thread.
 */
import { AsyncLocalStorage } from "node:async_hooks";

type Metadata = Record<string, string | number | boolean | null>;
type Report = (metadata: Metadata) => Promise<void>;

const current = new AsyncLocalStorage<{ tool: string; report: Report }>();

const SECRET = /(gh[opsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|x-access-token:[^@\s]+|(?:api[-_]?key|token|authorization)["':= ]+[^\s"',]+)/gi;

/** Removes anything shaped like a credential and caps the length, keeping the end (command output) or the start (a message). */
export function scrub(text: string, max = 400, keep: "end" | "start" = "end"): string {
  const clean = text.replace(SECRET, "[redacted]");
  if (clean.length <= max) return clean;
  return keep === "end" ? `…${clean.slice(-max)}` : `${clean.slice(0, max)}…`;
}

/** Writes one record for the running tool; never throws, never blocks the tool on telemetry. */
export async function emit(metadata: Metadata): Promise<void> {
  const scope = current.getStore();
  if (!scope) return;
  try {
    await scope.report({ tool: scope.tool, ...metadata });
  } catch {
    // Telemetry is best effort.
  }
}

export interface Failure {
  /** github_auth, github_forbidden, github_not_found, api_auth, api_rejected, api_unavailable, network, command_missing, conflict, input, unknown */
  kind: string;
  /** One sentence for the model to pass on, with the next step. */
  summary: string;
}

/** Classifies an error from a command, the GitHub CLI or the management API. */
export function describeFailure(error: unknown): Failure {
  const message = error instanceof Error ? error.message : String(error);
  const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : undefined;
  if (status !== undefined) {
    if (status === 401 || status === 403) {
      return {
        kind: "api_auth",
        summary: `the OpenComputer API refused the call (${status}); the project secret OPENCOMPUTER_API_KEY may be missing, revoked or scoped to another project`,
      };
    }
    if (status >= 500 || status === 429) {
      return { kind: "api_unavailable", summary: `the OpenComputer API is unavailable (${status}); retrying the same call once is safe` };
    }
    return { kind: "api_rejected", summary: `the OpenComputer API rejected the call (${status}): ${scrub(message, 300, "start")}` };
  }
  if (/could not start/i.test(message)) {
    return { kind: "command_missing", summary: "a command the tool needs is missing on the computer" };
  }
  if (/bad credentials|HTTP 401|authentication failed|could not read username|requires authentication/i.test(message)) {
    return {
      kind: "github_auth",
      summary: "GitHub rejected the credentials; the token may have expired: run one shell command to refresh it, then retry once",
    };
  }
  if (/HTTP 403|resource not accessible by integration|permission .*denied|write access to repository not granted/i.test(message)) {
    return {
      kind: "github_forbidden",
      summary: "GitHub refused the operation; the OpenComputer GitHub App installation may not grant this repository or permission",
    };
  }
  if (/HTTP 404|could not resolve to a repository|repository not found|couldn't find remote ref/i.test(message)) {
    return { kind: "github_not_found", summary: "GitHub could not find the repository, branch or file" };
  }
  if (/CONFLICT|merge conflict/i.test(message)) {
    return { kind: "conflict", summary: "the branches conflict" };
  }
  if (/ENOTFOUND|ETIMEDOUT|ECONNRESET|EAI_AGAIN|network|timed out/i.test(message)) {
    return { kind: "network", summary: "a network call failed; retrying once is safe" };
  }
  if (/ must | is required| must be |at most |needs |one delegate call|appears once|go to /.test(message)) {
    return { kind: "input", summary: message };
  }
  return { kind: "unknown", summary: scrub(message, 500, "start") };
}

/**
 * Runs a tool with telemetry: a start record, a record per command and API
 * call (see `emit` callers), and an end record with the outcome. A failure
 * is rethrown as `<tool> failed: <summary>` so the model can tell the person
 * plainly; the full detail is in the event log.
 */
export async function traced<T>(
  tool: string,
  context: { reportProgress?: Report },
  input: Record<string, unknown>,
  run: () => Promise<T>,
): Promise<T> {
  const report: Report = context.reportProgress ? (metadata) => context.reportProgress!(metadata) : async () => {};
  return current.run({ tool, report }, async () => {
    const started = Date.now();
    await emit({ event: "tool_started", input: scrub(JSON.stringify(input), 300, "start") });
    try {
      const output = await run();
      await emit({ event: "tool_succeeded", ms: Date.now() - started });
      return output;
    } catch (error) {
      const failure = describeFailure(error);
      await emit({
        event: "tool_failed",
        ms: Date.now() - started,
        kind: failure.kind,
        detail: scrub(error instanceof Error ? error.message : String(error), 800, "start"),
      });
      throw new Error(`${tool} failed: ${failure.summary}.`);
    }
  });
}
