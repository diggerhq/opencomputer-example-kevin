import { useConnection, useInput, useModel, useTool, type AgentInput } from "@opencomputer/agent";

import { github } from "./connections/github";
import { reviewerInstructions } from "./process/instructions";
import { ROLES } from "./process/roles";

/** The reviewer brief: the fenced JSON inside the consult prompt. */
export interface ReviewerBrief {
  artifact: "design" | "build";
  slug: string;
  repo: string;
  docsRepo?: string;
  branch?: string;
  base: string;
  designUrl: string;
  planUrl?: string;
}

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const REF = /^(?!-)(?!\/)(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9._\/-]{1,200}(?<![./])$/;
const HTTPS = /^https:\/\/[^\s\x00-\x1f\x7f]{1,500}$/;

/** A consult as the reviewer receives it: `{ source: "subagent", payload: { kind: "consult", … }, text }`. */
export function isConsult(input: Readonly<AgentInput>): boolean {
  const payload = input.payload;
  return (
    input.source === "subagent" &&
    typeof payload === "object" &&
    payload !== null &&
    !Array.isArray(payload) &&
    (payload as Record<string, unknown>).kind === "consult"
  );
}

/** The first fenced block of the consult prompt, parsed and checked against the brief shape; undefined when there is none or it does not fit. */
export function parseBrief(text: string | undefined): ReviewerBrief | undefined {
  const block = /```(?:json)?[ \t]*\n([\s\S]*?)\n```/.exec(text ?? "")?.[1];
  if (block === undefined) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(block);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  const ok = (key: string, pattern: RegExp, optional = false) =>
    (optional && v[key] === undefined) || (typeof v[key] === "string" && pattern.test(v[key] as string));
  if (v.artifact !== "design" && v.artifact !== "build") return undefined;
  if (
    !ok("slug", NAME) ||
    !ok("repo", REPO) ||
    !ok("docsRepo", REPO, true) ||
    !ok("branch", REF, true) ||
    !ok("base", REF) ||
    !ok("designUrl", HTTPS) ||
    !ok("planUrl", HTTPS, true)
  ) {
    return undefined;
  }
  const brief: ReviewerBrief = {
    artifact: v.artifact,
    slug: v.slug as string,
    repo: v.repo as string,
    base: v.base as string,
    designUrl: v.designUrl as string,
  };
  if (v.docsRepo !== undefined) brief.docsRepo = v.docsRepo as string;
  if (v.branch !== undefined) brief.branch = v.branch as string;
  if (v.planUrl !== undefined) brief.planUrl = v.planUrl as string;
  return brief;
}

/** One paragraph naming what is under review and where to read it; the full brief stays in the lead's message. */
export function renderBrief(brief: ReviewerBrief | undefined): string {
  if (!brief) {
    return [
      "# This consult",
      "The lead's message carries no brief JSON: it is a rebuttal or a follow-up in a review you already hold. Answer it from what you read before, under the same rules, in the same report shape, keeping the finding ids.",
    ].join("\n\n");
  }
  const docs = brief.docsRepo ? ` and the docs repo \`${brief.docsRepo}\`` : "";
  const target =
    brief.artifact === "design"
      ? `the design of \`${brief.slug}\` (${brief.designUrl}) against the code in \`${brief.repo}\` at \`${brief.base}\`${docs}`
      : `the integrated branch \`${brief.branch ?? `agent/${brief.slug}`}\` of \`${brief.slug}\` in \`${brief.repo}\` against \`${brief.base}\` (compare \`${brief.base}...${brief.branch ?? `agent/${brief.slug}`}\`), judged by the design (${brief.designUrl})${brief.planUrl ? ` and the plan (${brief.planUrl})` : ""}${docs}`;
  return [
    "# This consult",
    `Review ${target}. Read with \`gh api\` (contents, compare, commits) or from the mounted \`/workspace\`; your shell tool is \`sandbox_exec\`, and it is for reading only.`,
  ].join("\n\n");
}

const NOT_A_CONSULT =
  "# Not a consult\n\nThis input is not a consult from Kevin's lead. Reply with one line and do nothing else: \"I review only on the lead's request.\"";

/**
 * Kevin's reviewer: the brief arrives as a consult prompt;
 * findings go back as the consult answer. It has no code tools and a
 * read-scoped GitHub token (connections/github.ts), and only a consult
 * turn gets the shell.
 */
export default function Reviewer() {
  useModel("anthropic/claude-fable-5.1");
  const input = useInput();
  if (!isConsult(input)) return [ROLES.reviewer, NOT_A_CONSULT].join("\n\n");
  // The shell is the only way to read on Workerd (no file tools; the
  // instructions tell it not to write), so it is selected, alone: no
  // defined tool, no `ask`, no `consult`.
  // The platform has no read-only shell, and a consult member shares the
  // lead's /workspace read-write. GitHub writes are refused by the
  // read-scoped token; local writes are held back by the instructions alone.
  useTool("sandbox_exec");
  useConnection(github);
  return [reviewerInstructions(), renderBrief(parseBrief(input.text))].join("\n\n");
}
