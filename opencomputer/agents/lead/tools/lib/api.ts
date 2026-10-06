/**
 * The OpenComputer management API through the `opencomputer` connection: the
 * platform attaches `x-api-key` at the edge, so no credential is on the
 * computer. Paths are absolute, prefix included.
 */
import { config } from "../../config";
import { opencomputer } from "../../connections/opencomputer";

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
  const response = await opencomputer.fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const text = await response.text();
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

/**
 * The subscription that wakes this lead session on implementer outcomes,
 * created when missing. Subscriptions are captured at
 * admission, so it must exist before the first implementer turn starts.
 */
export async function ensureSubscription(leadSessionId: string): Promise<string> {
  const [existing] = await leadSubscriptions(leadSessionId);
  if (existing) return existing.id;
  const { subscription } = await api<{ subscription: Subscription }>("POST", subscriptionsPath(), {
    body: {
      agentId: implementerAgent(),
      events: ["turn.completed", "turn.failed", "turn.cancelled"],
      destination: { type: "session", sessionId: leadSessionId },
      environment: config.environment,
    },
  });
  return subscription.id;
}

/** Deletes every subscription of this lead session; returns how many went. */
export async function deleteSubscriptions(leadSessionId: string): Promise<number> {
  const subscriptions = await leadSubscriptions(leadSessionId);
  for (const subscription of subscriptions) {
    try {
      await api("DELETE", `${subscriptionsPath()}/${encodeURIComponent(subscription.id)}`);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) throw error;
    }
  }
  return subscriptions.length;
}
