/**
 * Sets the project secret OPENCOMPUTER_API_KEY from opencomputer/.env.local
 * through the management API. `opencomputer secrets set` refuses projects with
 * more than one agent, so this calls the API directly.
 *
 *   npm run secret
 *
 * Prints the status and the secret's name, never its value.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { config } from "../opencomputer/agents/lead/config";

const NAME = "OPENCOMPUTER_API_KEY";
const API = "https://app.opencomputer.dev";
const ENV_FILE = resolve(import.meta.dirname, "..", "opencomputer", ".env.local");

async function readKey(): Promise<string> {
  const text = await readFile(ENV_FILE, "utf8").catch(() => "");
  for (const line of text.split("\n")) {
    const match = /^\s*(?:export\s+)?OPENCOMPUTER_API_KEY\s*=\s*(.*?)\s*$/.exec(line);
    if (match) return (match[1] ?? "").replace(/^(["'])(.*)\1$/, "$2");
  }
  return "";
}

const key = await readKey();
if (!key) {
  console.error(`${NAME} is not set in opencomputer/.env.local`);
  process.exit(1);
}

const response = await fetch(`${API}/api/managed-agents/projects/${config.projectId}/secrets/${NAME}`, {
  method: "PUT",
  headers: { "content-type": "application/json", "x-api-key": key },
  body: JSON.stringify({ value: key, environment: config.environment, allowedOrigins: [API] }),
});
console.log(`${response.status} ${response.ok ? "set" : "failed to set"} ${NAME} (${config.environment})`);
if (!response.ok) process.exit(1);
