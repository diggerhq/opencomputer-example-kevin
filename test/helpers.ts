import type { AgentInput } from "@opencomputer/agent";

export interface Rendered {
  instructions: string;
  tools: string[];
  connections: string[];
  services: string[];
  models: unknown[];
}

const HOOKS = Symbol.for("opencomputer.agent-hooks");

/** Renders an agent once with this input, the way the host does, and records what it selected. */
export function render(agent: () => string, input: AgentInput): Rendered {
  const scope = { tools: [] as string[], connections: [] as string[], services: [] as string[], models: [] as unknown[] };
  const id = (value: string | { id: string }) => (typeof value === "string" ? value : value.id);
  (globalThis as Record<PropertyKey, unknown>)[HOOKS] = {
    useInput: () => input,
    useModel: (model: unknown) => scope.models.push(model),
    useTool: (tool: string | { id: string }) => scope.tools.push(id(tool)),
    useConnection: (connection: string | { id: string }) => scope.connections.push(id(connection)),
    useService: (service: string) => scope.services.push(service),
    useSubagent: () => undefined,
    useSessionData: () => undefined,
    useMcpServer: () => undefined,
    useMemory: () => undefined,
  };
  try {
    const instructions = agent();
    return { instructions, ...scope, tools: scope.tools.sort(), connections: scope.connections.sort() };
  } finally {
    delete (globalThis as Record<PropertyKey, unknown>)[HOOKS];
  }
}

/** An authored Slack mention, shaped as the ingress delivers it. */
export function slackMention(text: string): AgentInput {
  return {
    source: "channel",
    channel: { provider: "slack", connectionId: "conn-1", workspaceId: "T0000001", userId: "U0000001" },
    text,
  };
}

/** An authored subagent input: an implementer assignment or a reviewer consult brief. */
export function subagentInput(text: string, payload: Record<string, string>): AgentInput {
  return { source: "subagent", text, payload };
}
