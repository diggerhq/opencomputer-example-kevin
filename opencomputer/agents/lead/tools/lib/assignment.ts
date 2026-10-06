/**
 * The assignment (design 019 §11): one schema for `delegate` input and the
 * implementer's turn payload, and the one-paragraph turn text that goes with
 * it (work 040 "Implementer assignment text").
 */
import { checkRepo } from "./github";

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

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STREAM = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** JSON Schema of one assignment, for the tool's input. */
export const ASSIGNMENT_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["build", "spike", "investigate"] },
    slug: { type: "string", description: "The work's slug (kebab, ≤40 chars)" },
    repo: { type: "string", description: "The code repo, owner/name" },
    stream: { type: "string", description: "Stream name (kebab); investigate-<topic> / spike-<topic> for those kinds" },
    branch: { type: "string", description: "build/spike: agent/<slug>--<stream> (the default); omit for investigate" },
    base: { type: "string", description: "Branch the stream starts from: agent/<slug> for build; the default branch for investigate" },
    attempt: { type: "integer", minimum: 1, description: "1, then +1 on every re-dispatch of the stream" },
    files: { type: "array", items: { type: "string" }, description: "Exactly the files the stream may touch" },
    doneWhen: { type: "string" },
    checks: { type: "string", description: "The repo's check command" },
    designUrl: { type: "string", description: "Link to the design section, never the content" },
    planUrl: { type: "string", description: "Link to the plan section, never the content" },
  },
  required: ["kind", "slug", "repo", "stream", "base", "attempt", "files", "doneWhen", "checks"],
  additionalProperties: false,
} as const;

function text(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`assignment.${name} is required`);
  return value;
}

/** Checks one assignment and fills its default branch. */
export function checkAssignment(value: unknown): Assignment {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("an assignment must be an object");
  const input = value as Record<string, unknown>;
  const kind = input.kind;
  if (kind !== "build" && kind !== "spike" && kind !== "investigate") {
    throw new Error('assignment.kind must be "build", "spike" or "investigate"');
  }
  const slug = text(input.slug, "slug");
  if (!SLUG.test(slug) || slug.length > 40) throw new Error(`assignment.slug must be kebab-case, ≤40 chars: ${slug}`);
  const stream = text(input.stream, "stream");
  if (!STREAM.test(stream) || stream.length > 60) throw new Error(`assignment.stream must be kebab-case: ${stream}`);
  const attempt = input.attempt;
  if (!Number.isInteger(attempt) || (attempt as number) < 1) throw new Error("assignment.attempt must be 1 or more");
  if (!Array.isArray(input.files) || !input.files.every((file) => typeof file === "string")) {
    throw new Error("assignment.files must be an array of paths");
  }
  let branch: string | undefined;
  if (kind === "investigate") {
    if (input.branch !== undefined) throw new Error("an investigate assignment is read-only and has no branch");
  } else {
    branch = input.branch === undefined ? `agent/${slug}--${stream}` : text(input.branch, "branch");
    if (!branch.startsWith(`agent/${slug}--`)) throw new Error(`assignment.branch must be agent/${slug}--<name>, got ${branch}`);
  }
  for (const key of ["designUrl", "planUrl"] as const) {
    if (input[key] !== undefined && typeof input[key] !== "string") throw new Error(`assignment.${key} must be a string`);
  }
  return {
    kind,
    slug,
    repo: checkRepo(input.repo),
    stream,
    ...(branch ? { branch } : {}),
    base: text(input.base, "base"),
    attempt: attempt as number,
    files: input.files as string[],
    doneWhen: text(input.doneWhen, "doneWhen"),
    checks: text(input.checks, "checks"),
    ...(typeof input.designUrl === "string" ? { designUrl: input.designUrl } : {}),
    ...(typeof input.planUrl === "string" ? { planUrl: input.planUrl } : {}),
  };
}

/** The turn text: one paragraph naming repo, branch, base, stream, done-when and the plan section; the payload carries the JSON. */
export function assignmentText(assignment: Assignment): string {
  const where =
    assignment.kind === "investigate"
      ? `read-only on ${assignment.repo} at ${assignment.base} (no branch, no commits)`
      : `in ${assignment.repo} on branch ${assignment.branch} from base ${assignment.base}`;
  const links = [
    assignment.planUrl ? `Plan section: ${assignment.planUrl}.` : "",
    assignment.designUrl ? `Design: ${assignment.designUrl}.` : "",
  ].filter(Boolean);
  return [
    `${assignment.kind === "build" ? "Build" : assignment.kind === "spike" ? "Spike" : "Investigate"} stream ${assignment.stream} of ${assignment.slug} (attempt ${assignment.attempt}) ${where}.`,
    `Done when: ${assignment.doneWhen}.`.replace(/\.\.$/, "."),
    `Checks: ${assignment.checks}.`.replace(/\.\.$/, "."),
    ...links,
    "The payload carries this assignment as JSON; end with your report as one fenced JSON block.",
  ].join(" ");
}
