/**
 * The plan's machine-readable state: one fenced ```kevin-state``` JSON block in the plan.
 * commit_document rewrites it, where_are_we parses it; the prose build
 * record beside it is never parsed.
 */

export interface StreamState {
  stream: string;
  attempt: number;
  sessionId: string;
  /** `agent/<slug>--<stream>`; empty for an investigation, which has no branch. */
  branch: string;
  /** running · landed · merged · blocked · stopping · conflict — the lead's word; only "running" is read by the tools. */
  state: string;
}

export interface KevinState {
  version: number;
  leadSessionId: string;
  threadId?: string;
  subscriptionId?: string;
  streams: StreamState[];
}

const BLOCK = /```kevin-state[ \t]*\n([\s\S]*?)\n```/;
// `version: 3`, `- version: 3`, `**version:** v3`
const VERSION_LINE = /^(\s*(?:[-*]\s+)?\**version\**\s*:\s*\**\s*)v?(\d+)\s*$/im;

export function planPath(slug: string): string {
  return `.agents/work/${slug}.md`;
}

export function designPath(slug: string): string {
  return `.agents/design/${slug}.md`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Validates a state value (from a plan or from the model); throws with the first problem. */
export function checkState(value: unknown): KevinState {
  if (!isRecord(value)) throw new Error("kevin-state must be an object");
  const { version, leadSessionId, threadId, subscriptionId, streams } = value;
  if (!Number.isInteger(version) || (version as number) < 0) throw new Error("kevin-state.version must be a whole number");
  if (typeof leadSessionId !== "string" || !leadSessionId) throw new Error("kevin-state.leadSessionId is required");
  if (threadId !== undefined && typeof threadId !== "string") throw new Error("kevin-state.threadId must be a string");
  if (subscriptionId !== undefined && typeof subscriptionId !== "string") {
    throw new Error("kevin-state.subscriptionId must be a string");
  }
  if (!Array.isArray(streams)) throw new Error("kevin-state.streams must be an array");
  const checked = streams.map((stream, index): StreamState => {
    if (!isRecord(stream)) throw new Error(`kevin-state.streams[${index}] must be an object`);
    const { stream: name, attempt, sessionId, branch, state } = stream;
    if (typeof name !== "string" || !name) throw new Error(`kevin-state.streams[${index}].stream is required`);
    if (!Number.isInteger(attempt) || (attempt as number) < 1) {
      throw new Error(`kevin-state.streams[${index}].attempt must be 1 or more`);
    }
    if (typeof sessionId !== "string") throw new Error(`kevin-state.streams[${index}].sessionId must be a string`);
    if (typeof branch !== "string") throw new Error(`kevin-state.streams[${index}].branch must be a string`);
    if (typeof state !== "string" || !state) throw new Error(`kevin-state.streams[${index}].state is required`);
    return { stream: name, attempt: attempt as number, sessionId, branch, state };
  });
  return {
    version: version as number,
    leadSessionId,
    ...(threadId ? { threadId } : {}),
    ...(subscriptionId ? { subscriptionId } : {}),
    streams: checked,
  };
}

/** The plan's state block, or null when the plan has none. Throws on a malformed block. */
export function readState(plan: string): KevinState | null {
  const match = plan.match(BLOCK);
  if (!match) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1] ?? "");
  } catch (error) {
    throw new Error(`the kevin-state block is not JSON: ${(error as Error).message}`);
  }
  return checkState(parsed);
}

export function renderState(state: KevinState): string {
  return "```kevin-state\n" + JSON.stringify(state, null, 2) + "\n```";
}

/** Replaces the state block, or inserts it before the plan's first `## ` section (at the end when there is none). */
export function writeState(plan: string, state: KevinState): string {
  const block = renderState(state);
  if (BLOCK.test(plan)) return plan.replace(BLOCK, () => block);
  const section = plan.search(/^## /m);
  if (section < 0) return `${plan.replace(/\s*$/, "")}\n\n${block}\n`;
  return `${plan.slice(0, section)}${block}\n\n${plan.slice(section)}`;
}

/** The header's `version:` value, or 0. */
export function readHeaderVersion(plan: string): number {
  const match = plan.match(VERSION_LINE);
  return match ? Number(match[2]) : 0;
}

/** Sets the header's `version:` line, adding one under the title when absent. */
export function writeHeaderVersion(plan: string, version: number): string {
  if (VERSION_LINE.test(plan)) return plan.replace(VERSION_LINE, (_, prefix: string) => `${prefix}${version}`);
  const title = plan.match(/^# .*$/m);
  if (!title || title.index === undefined) return `version: ${version}\n\n${plan}`;
  const end = title.index + title[0].length;
  return `${plan.slice(0, end)}\n\nversion: ${version}${plan.slice(end)}`;
}
