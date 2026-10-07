/**
 * The OpenComputer management API through the `opencomputer` connection: the
 * platform attaches `x-api-key` at the edge, so no credential is on the
 * computer. Paths are absolute, prefix included.
 */
import { config } from "../../config";
import { opencomputer } from "../../connections/opencomputer";
import { emit } from "./telemetry";

const BASE = "/api/managed-agents";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
  }
}

/** One management-API call; JSON in, JSON out; a non-2xx answer throws ApiError. */
export async function api<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  options: { body?: unknown; idempotencyKey?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.idempotencyKey) headers["idempotency-key"] = options.idempotencyKey;
  const started = Date.now();
  const response = await opencomputer.fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const text = await response.text();
  await emit({ event: "api", method, path, status: response.status, ms: Date.now() - started });
  if (!response.ok) {
    let code: string | undefined;
    let message = text.slice(0, 300);
    try {
      const parsed = JSON.parse(text) as { error?: { code?: string; message?: string } | string };
      if (typeof parsed.error === "string") message = parsed.error;
      else if (parsed.error) {
        code = parsed.error.code;
        message = parsed.error.message ?? message;
      }
    } catch {
      // keep the raw text
    }
    throw new ApiError(
      response.status,
      code,
      `${method} ${BASE}${path} answered ${response.status}${code ? ` ${code}` : ""}: ${message}` +
        (response.status >= 500 || response.status === 429 ? " (retrying the same call is safe)" : ""),
    );
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export interface Subscription {
  id: string;
  agentId?: string;
  events: string[];
  destination: { type: string; sessionId: string };
  environment: string;
  sourceLabels?: Record<string, string>;
}

/**
 * The label that ties an implementer session to the lead session that
 * dispatched it: every implementer is created with it, and the lead's
 * subscription selects on it (`sourceLabels`), so a lead wakes only on its
 * own thread's outcomes (work 040 K27). A platform that does not know
 * `sourceLabels` ignores the field and delivers every implementer outcome
 * in the environment, as before.
 */
export const LEAD_LABEL = "kevin-lead";

/** `{ "kevin-lead": <leadSessionId> }`: an implementer session's labels and the subscription's `sourceLabels`. */
export function leadLabels(leadSessionId: string): Record<string, string> {
  return { [LEAD_LABEL]: leadSessionId };
}

const implementerAgent = () => `${config.agentPrefix}--implementer`;
const subscriptionsPath = () => `/projects/${config.projectId}/event-subscriptions`;

/** This lead session's subscriptions to implementer outcomes (there is never one to the reviewer). */
export async function leadSubscriptions(leadSessionId: string): Promise<Subscription[]> {
  const { subscriptions } = await api<{ subscriptions: Subscription[] }>("GET", subscriptionsPath());
  return subscriptions.filter(
    (subscription) =>
      subscription.destination?.type === "session" &&
      subscription.destination.sessionId === leadSessionId &&
      subscription.agentId === implementerAgent() &&
      subscription.environment === config.environment,
  );
}

/** Whether a subscription selects exactly this lead's implementers. */
function selectsLead(subscription: Subscription, leadSessionId: string): boolean {
  const labels = subscription.sourceLabels ?? {};
  const wanted = leadLabels(leadSessionId);
  return Object.keys(labels).length === Object.keys(wanted).length && Object.entries(wanted).every(([key, value]) => labels[key] === value);
}

/**
 * The subscription that wakes this lead session on implementer outcomes,
 * selecting the implementers this lead dispatched (`sourceLabels`; work 040
 * K27, K33). Subscriptions are captured at admission, so it must exist
 * before the first implementer turn starts.
 *
 * - One that selects this lead is reused.
 * - One made before labels (it selects nothing, so it hears every
 *   implementer in the environment) is reused while this thread still has a
 *   stream running: that stream's builder may predate labels and carry
 *   none, and keeping both subscriptions would deliver each labelled
 *   outcome twice.
 * - Otherwise the labelled subscription is created and the unlabelled ones
 *   are deleted.
 */
export async function ensureSubscription(leadSessionId: string, options: { streamsRunning?: boolean } = {}): Promise<string> {
  const existing = await leadSubscriptions(leadSessionId);
  const selecting = existing.find((subscription) => selectsLead(subscription, leadSessionId));
  const unlabelled = existing.filter((subscription) => !subscription.sourceLabels);
  if (!selecting && unlabelled[0] && options.streamsRunning) return unlabelled[0].id;
  const id = selecting?.id ?? (await createLeadSubscription(leadSessionId));
  for (const old of unlabelled) await deleteSubscription(old.id);
  return id;
}

async function createLeadSubscription(leadSessionId: string): Promise<string> {
  const { subscription } = await api<{ subscription: Subscription }>("POST", subscriptionsPath(), {
    body: {
      agentId: implementerAgent(),
      events: ["turn.completed", "turn.failed", "turn.cancelled"],
      destination: { type: "session", sessionId: leadSessionId },
      environment: config.environment,
      sourceLabels: leadLabels(leadSessionId),
    },
  });
  return subscription.id;
}

/** Deletes one subscription; one already gone counts as deleted. */
async function deleteSubscription(id: string): Promise<void> {
  try {
    await api("DELETE", `${subscriptionsPath()}/${encodeURIComponent(id)}`);
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) throw error;
  }
}

/** Deletes every subscription of this lead session; returns how many went. */
export async function deleteSubscriptions(leadSessionId: string): Promise<number> {
  const subscriptions = await leadSubscriptions(leadSessionId);
  for (const subscription of subscriptions) await deleteSubscription(subscription.id);
  return subscriptions.length;
}
