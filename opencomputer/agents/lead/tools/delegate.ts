import { defineTool } from "@opencomputer/agent";

import { config } from "../config";
import { api, ensureSubscription } from "./lib/api";
import { type Assignment, ASSIGNMENT_SCHEMA, assignmentText, checkAssignment } from "./lib/assignment";
import { commitDocument, planLocation, readPlan } from "./lib/documents";
import { ensureRemoteBranch } from "./lib/git";
import { type KevinState, readHeaderVersion, type StreamState } from "./lib/state";

/** `kevin:<leadSessionId>:<stream>:<attempt>`: organisation-wide, so never slug-based (design 019 §12 "Fan-out"). */
export function idempotencyKey(leadSessionId: string, stream: string, attempt: number): string {
  return `kevin:${leadSessionId}:${stream}:${attempt}`;
}

/**
 * Starts implementers (work 040 "Delegate"; design 019 §11 sequence step 5,
 * §12 "Fan-out"), in this order and no other:
 *   1. ensure this lead session's subscription to implementer outcomes —
 *      before the first delegate of any kind, since subscriptions are
 *      captured when a turn is admitted;
 *   2. `POST /sessions` per assignment, keyed `kevin:<lead>:<stream>:<attempt>`;
 *   3. commit the plan's `kevin-state` block with every session, running;
 *   4. `POST /sessions/<id>/turns` per assignment, key + `:turn`.
 * A retry reads the state first and reuses the session it recorded; the keys
 * make every call a replay.
 */
export async function delegateAssignments(
  raw: unknown,
  leadSessionId: string,
): Promise<{ sessions: Array<{ stream: string; attempt: number; sessionId: string }> }> {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("assignments must be a non-empty array");
  const assignments = raw.map(checkAssignment);
  const [first] = assignments as [Assignment, ...Assignment[]];
  if (assignments.some((a) => a.slug !== first.slug || a.repo !== first.repo)) {
    throw new Error("one delegate call covers one piece of work: every assignment needs the same slug and repo");
  }
  if (new Set(assignments.map((a) => a.stream)).size !== assignments.length) {
    throw new Error("each stream appears once per delegate call");
  }
  if (assignments.length > config.maxImplementers) {
    throw new Error(`at most ${config.maxImplementers} implementers run at once: ${assignments.length} asked`);
  }

  // The state first: a retry finds the sessions it already created.
  const plan = await readPlan(first.repo, first.slug);
  const before = plan?.state ?? null;
  const dispatched = new Set(assignments.map((a) => a.stream));
  const stillRunning = (before?.streams ?? []).filter((s) => s.state === "running" && !dispatched.has(s.stream)).length;
  if (stillRunning + assignments.length > config.maxImplementers) {
    throw new Error(
      `at most ${config.maxImplementers} implementers run at once: ${stillRunning} running + ${assignments.length} asked`,
    );
  }

  // 1. The subscription, before any implementer turn exists.
  const subscriptionId = await ensureSubscription(leadSessionId);

  // 2. Sessions.
  const sessions: Array<{ assignment: Assignment; sessionId: string }> = [];
  for (const assignment of assignments) {
    const recorded = before?.streams.find(
      (s) => s.stream === assignment.stream && s.attempt === assignment.attempt && s.sessionId,
    );
    const sessionId =
      recorded?.sessionId ??
      (
        await api<{ session: { id: string } }>("POST", "/sessions", {
          body: { agentId: `${config.agentPrefix}--implementer@${config.environment}` },
          idempotencyKey: idempotencyKey(leadSessionId, assignment.stream, assignment.attempt),
        })
      ).session.id;
    sessions.push({ assignment, sessionId });
  }

  // 3. The state block, before any turn starts.
  const location = await planLocation(first.repo, first.slug);
  const startPoint = first.base === location.branch ? undefined : first.base;
  await commitDocument(
    {
      repo: location.repo,
      branch: location.branch,
      path: location.path,
      ...(plan ? {} : { content: `# ${first.slug}\n\nversion: 1\n` }),
      message: `kevin: dispatch ${sessions.map(({ assignment }) => `${assignment.stream}@${assignment.attempt}`).join(", ")}`,
      state: nextState(before, plan ? readHeaderVersion(plan.text) : 1, leadSessionId, subscriptionId, sessions),
      ...(startPoint && location.repo === first.repo ? { startPoint } : {}),
    },
    leadSessionId,
  );
  // A build stream starts from agent/<slug>; in docs-repo mode nothing has created it in the code repo yet.
  for (const { assignment } of sessions) {
    if (assignment.kind === "build" && assignment.base === `agent/${assignment.slug}`) {
      await ensureRemoteBranch(assignment.repo, assignment.base);
    }
  }

  // 4. Turns.
  for (const { assignment, sessionId } of sessions) {
    await api("POST", `/sessions/${encodeURIComponent(sessionId)}/turns`, {
      body: { input: assignmentText(assignment), payload: assignment, mode: "queue" },
      idempotencyKey: `${idempotencyKey(leadSessionId, assignment.stream, assignment.attempt)}:turn`,
    });
  }
  return {
    sessions: sessions.map(({ assignment, sessionId }) => ({
      stream: assignment.stream,
      attempt: assignment.attempt,
      sessionId,
    })),
  };
}

function nextState(
  before: KevinState | null,
  headerVersion: number,
  leadSessionId: string,
  subscriptionId: string,
  sessions: Array<{ assignment: Assignment; sessionId: string }>,
): KevinState {
  const streams: StreamState[] = [...(before?.streams ?? [])];
  for (const { assignment, sessionId } of sessions) {
    const entry: StreamState = {
      stream: assignment.stream,
      attempt: assignment.attempt,
      sessionId,
      branch: assignment.branch ?? "",
      state: "running",
    };
    const index = streams.findIndex((s) => s.stream === assignment.stream);
    if (index < 0) streams.push(entry);
    else streams[index] = entry;
  }
  return {
    version: Math.max(before?.version ?? 0, headerVersion),
    leadSessionId: before?.leadSessionId ?? leadSessionId,
    ...(before?.threadId ? { threadId: before.threadId } : {}),
    subscriptionId,
    streams,
  };
}

export const delegate = defineTool({
  name: "delegate",
  description:
    "Start implementers, one session per assignment (≤7 running). Creates the outcome subscription first, then the sessions, " +
    "records them in the plan's kevin-state block, then starts their turns. Safe to call again with the same assignments: " +
    "it reuses what it recorded. Returns { sessions: [{ stream, attempt, sessionId }] }. Never consult or ask in a turn that delegates.",
  input: {
    type: "object",
    properties: {
      assignments: { type: "array", minItems: 1, items: ASSIGNMENT_SCHEMA },
    },
    required: ["assignments"],
    additionalProperties: false,
  },
  async run({ input, sessionId }) {
    return delegateAssignments(input.assignments, sessionId);
  },
});
