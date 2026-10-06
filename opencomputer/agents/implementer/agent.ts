import { useConnection, useInput, useModel, useTool, type DataValue } from "@opencomputer/agent";

import { github } from "./connections/github";
import { implementerInstructions } from "./process/instructions";

/** Puts the GitHub connection in the deployment manifest (connections deploy by import). */
export const CONNECTIONS = [github] as const;

/**
 * The computer command tool. Workerd registers it as both `shell` and
 * `sandbox_exec` (blue `src/workerd-runtime/index.ts`, `registerCommandTool`);
 * the docs name `sandbox_exec`. Workerd has no file tools, so this is the
 * implementer's only way to read and write code. The render passes the id as
 * a string literal: the CLI builds the manifest from the literal ids of the
 * useTool calls in the source, and a constant argument would be missed.
 */
export const SHELL = "sandbox_exec";

/** design 019 §11 "assignment": one schema for `delegate` input and this turn's payload. */
export interface Assignment {
  kind: "build" | "spike" | "investigate";
  slug: string;
  repo: string;
  stream: string;
  branch?: string;
  base: string;
  attempt: number;
  files: string[];
  doneWhen: string;
  checks: string;
  designUrl?: string;
  planUrl?: string;
}

const KINDS = new Set(["build", "spike", "investigate"]);
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
// git check-ref-format, conservatively: no spaces, no "..", no control bytes, no leading "-" or "/"
const REF = /^(?!-)(?!\/)(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9._\/-]{1,200}(?<![./])$/;
const PATH = /^(?!\/)(?!.*(^|\/)\.\.(\/|$))[^\x00-\x1f\x7f]{1,300}$/;
const HTTPS = /^https:\/\/[^\s\x00-\x1f\x7f]{1,500}$/;
const LINE = /^[^\x00-\x1f\x7f]{1,500}$/;
const TEXT = /^[^\x00-\x09\x0b-\x1f\x7f]{1,4000}$/;

/**
 * Validates the turn payload against the assignment schema. The lead's
 * `delegate` writes it, but the payload is what this session acts on, so a
 * malformed one is refused with reasons rather than half-trusted.
 */
export function parseAssignment(payload: DataValue | undefined): { ok: true; assignment: Assignment } | { ok: false; problems: string[] } {
  if (payload === undefined || payload === null) return { ok: false, problems: ["no payload"] };
  if (typeof payload !== "object" || Array.isArray(payload)) return { ok: false, problems: ["payload is not an object"] };
  const p = payload as Record<string, DataValue>;
  const problems: string[] = [];
  const str = (key: string, pattern: RegExp, optional = false): string | undefined => {
    const value = p[key];
    if (value === undefined && optional) return undefined;
    if (typeof value !== "string" || !pattern.test(value)) {
      problems.push(value === undefined ? `${key} missing` : `${key} invalid`);
      return undefined;
    }
    return value;
  };

  const kind = p.kind;
  if (typeof kind !== "string" || !KINDS.has(kind)) problems.push("kind must be build, spike or investigate");
  const slug = str("slug", NAME);
  const repo = str("repo", REPO);
  const stream = str("stream", NAME);
  const branch = str("branch", REF, true);
  const base = str("base", REF);
  const doneWhen = str("doneWhen", TEXT);
  const checks = str("checks", LINE);
  const designUrl = str("designUrl", HTTPS, true);
  const planUrl = str("planUrl", HTTPS, true);
  const attempt = p.attempt;
  if (typeof attempt !== "number" || !Number.isInteger(attempt) || attempt < 1) problems.push("attempt must be an integer ≥ 1");
  const files = p.files;
  if (!Array.isArray(files) || !files.every((file) => typeof file === "string" && PATH.test(file))) {
    problems.push("files must be an array of relative paths");
  } else if (files.length === 0 && kind !== "investigate") {
    problems.push(`files is empty: a ${String(kind)} assignment names the files it may touch`);
  }

  if (problems.length) return { ok: false, problems };
  return {
    ok: true,
    assignment: {
      kind: kind as Assignment["kind"],
      slug: slug!,
      repo: repo!,
      stream: stream!,
      ...(branch !== undefined ? { branch } : {}),
      base: base!,
      attempt: attempt as number,
      files: files as string[],
      doneWhen: doneWhen!,
      checks: checks!,
      ...(designUrl !== undefined ? { designUrl } : {}),
      ...(planUrl !== undefined ? { planUrl } : {}),
    },
  };
}

/** The branch the work lands on (process/implementer.ts "How you work"); none for investigate. */
export function branchOf(assignment: Assignment): string | undefined {
  if (assignment.kind === "investigate") return undefined;
  return assignment.branch ?? `agent/${assignment.slug}--${assignment.stream}`;
}

/** work 040 "Implementer assignment text": one paragraph (repo, branch, base, stream, done-when, plan URL), then the files and the payload. */
export function renderAssignment(assignment: Assignment): string {
  const branch = branchOf(assignment);
  const where =
    assignment.kind === "investigate"
      ? `Investigate (read only: no branch, no commit, no push) in \`${assignment.repo}\` at \`${assignment.base}\``
      : `${assignment.kind === "spike" ? "Spike (throwaway, never merged)" : "Build"} stream \`${assignment.stream}\` of \`${assignment.slug}\` in \`${assignment.repo}\` on \`${branch}\` from \`${assignment.base}\``;
  const links = [
    assignment.designUrl ? `design: ${assignment.designUrl}` : undefined,
    assignment.planUrl ? `plan: ${assignment.planUrl}` : undefined,
  ].filter(Boolean);
  const paragraph = [
    `${where}, attempt ${assignment.attempt}.`,
    `Done when: ${assignment.doneWhen.replace(/\.$/, "")}.`,
    `Checks: \`${assignment.checks}\`.`,
    links.length ? `Contract (read first): ${links.join("; ")}.` : "No design or plan link: build from the done-when alone and report any gap in planAmendments.",
  ].join(" ");
  const scope =
    assignment.kind === "investigate"
      ? ["Areas to read (nothing is written):", ...assignment.files.map((file) => `- \`${file}\``)]
      : [
          "The only paths you may create, change or delete. Any other path, even a one-line fix, is out of scope: report it in `blocked` or `planAmendments` and do not touch it.",
          ...assignment.files.map((file) => `- \`${file}\``),
          "Before reporting, `git diff --name-only origin/" + assignment.base + "...HEAD` must list only these paths.",
        ];
  return [
    "# This assignment",
    paragraph,
    scope.join("\n"),
    "The payload, verbatim:",
    "```json",
    JSON.stringify(assignment, null, 2),
    "```",
    `Your shell tool is \`${SHELL}\`.`,
  ].join("\n\n");
}

/** Malformed or missing payload: no tools are selected, so the turn cannot act; it reports blocked. */
export function renderRefusal(problems: string[]): string {
  const report = {
    landed: [],
    checks: { status: "fail", tail: "not run: assignment malformed" },
    blocked: [`assignment missing or malformed: ${problems.join("; ")}`],
    planAmendments: [],
  };
  return [
    "# No valid assignment",
    "This turn's payload is not a valid assignment, so you do nothing: no clone, no branch, no command. Your whole reply is this report, exactly:",
    "```json",
    JSON.stringify(report),
    "```",
  ].join("\n\n");
}

/** Kevin's implementer (design 019 §5): one assignment from the turn payload, shell and GitHub only. */
export default function Implementer() {
  useModel("anthropic/claude-opus-5.5");
  // The lead's delegate starts this turn through the sessions API, which
  // admits it as `source: "user"` with the payload (blue src/edge/index.ts
  // turns route); the render reads the payload whatever the source.
  const parsed = parseAssignment(useInput().payload);
  if (!parsed.ok) return [implementerInstructions(), renderRefusal(parsed.problems)].join("\n\n");
  useTool("sandbox_exec");
  useConnection(github);
  return [implementerInstructions(), renderAssignment(parsed.assignment)].join("\n\n");
}
