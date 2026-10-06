/**
 * Report shapes as the process text states them, for the role tests. The
 * lead has its own parser; these check the same contract from the outside.
 */

/** The first fenced block's body (the lead's parser reads the first fenced block). */
export function firstFencedJson(text: string): string | undefined {
  return /```(?:json)?[ \t]*\n([\s\S]*?)\n```/.exec(text)?.[1];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, required: string[], optional: string[] = []) =>
  required.every((key) => key in value) && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
const strings = (value: unknown) => Array.isArray(value) && value.every((item) => typeof item === "string");

/** `{ landed: [{ sha, subject }], checks: { status: "pass" | "fail", tail }, blocked: [], planAmendments: [] }` */
export function isImplementerReport(value: unknown): boolean {
  if (!isRecord(value) || !exactKeys(value, ["landed", "checks", "blocked", "planAmendments"])) return false;
  const { landed, checks, blocked, planAmendments } = value;
  return (
    Array.isArray(landed) &&
    landed.every(
      (commit) =>
        isRecord(commit) &&
        exactKeys(commit, ["sha", "subject"]) &&
        typeof commit.sha === "string" &&
        /^[0-9a-f]{7,40}$/.test(commit.sha) &&
        typeof commit.subject === "string",
    ) &&
    isRecord(checks) &&
    exactKeys(checks, ["status", "tail"]) &&
    (checks.status === "pass" || checks.status === "fail") &&
    typeof checks.tail === "string" &&
    strings(blocked) &&
    strings(planAmendments)
  );
}

/** `{ verdict: "ship" | "fix-first", findings: [{ id, severity, file?, line?, scenario, change }] }`, severities per process/reviewer.ts. */
export function isReviewerReport(value: unknown): boolean {
  if (!isRecord(value) || !exactKeys(value, ["verdict", "findings"])) return false;
  const { verdict, findings } = value;
  if ((verdict !== "ship" && verdict !== "fix-first") || !Array.isArray(findings)) return false;
  const valid = findings.every(
    (finding) =>
      isRecord(finding) &&
      exactKeys(finding, ["id", "severity", "scenario", "change"], ["file", "line"]) &&
      typeof finding.id === "string" &&
      ["high", "medium", "low"].includes(finding.severity as string) &&
      (finding.file === undefined || typeof finding.file === "string") &&
      (finding.line === undefined || (typeof finding.line === "number" && Number.isInteger(finding.line))) &&
      typeof finding.scenario === "string" &&
      typeof finding.change === "string",
  );
  // process/reviewer.ts: fix-first iff any finding is high
  const high = findings.some((finding) => isRecord(finding) && finding.severity === "high");
  return valid && (verdict === "fix-first") === high;
}
