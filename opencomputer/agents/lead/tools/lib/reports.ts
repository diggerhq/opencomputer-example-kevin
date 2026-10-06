/**
 * Parsers for what other agents send the lead (design 019 §11 "implementer
 * report", "reviewer report"; work 040 "Implementer report", "Reviewer
 * brief"). Pure: the render uses them, so nothing here touches the computer.
 */

export interface ImplementerReport {
  landed: Array<{ sha: string; subject: string }>;
  checks: { status: "pass" | "fail"; tail: string };
  blocked: unknown[];
  planAmendments: unknown[];
}

export type ParsedImplementerReport =
  | { status: "reported"; report: ImplementerReport }
  | { status: "blocked"; reason: string; tail: string };

export interface ReviewerFinding {
  id: string;
  severity: string;
  file?: string;
  line?: number;
  scenario: string;
  change: string;
}

export interface ReviewerReport {
  verdict: "ship" | "fix-first";
  findings: ReviewerFinding[];
}

export type ParsedReviewerAnswer = ReviewerReport & {
  /** False when the answer was not a report (failed, cancelled, asking, unavailable). */
  available: boolean;
  /** The member did not settle within the consult deadline: wait, consult once more (work 040 "Reviewer brief"). */
  unsettled: boolean;
};

const FENCE = /```[^\n`]*\n([\s\S]*?)\n?```/;

/** The first fenced block's body, or null. */
export function firstFencedBlock(text: string): string | null {
  return text.match(FENCE)?.[1] ?? null;
}

/** The last `lines` lines of a text, for quoting. */
export function tail(text: string, lines = 15): string {
  return text.trimEnd().split("\n").slice(-lines).join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function checkImplementerReport(value: unknown): ImplementerReport | string {
  if (!isRecord(value)) return "the report is not an object";
  const { landed, checks, blocked, planAmendments } = value;
  if (!Array.isArray(landed) || !landed.every((item) => isRecord(item) && typeof item.sha === "string" && typeof item.subject === "string")) {
    return "landed must be [{ sha, subject }]";
  }
  if (!isRecord(checks) || (checks.status !== "pass" && checks.status !== "fail") || typeof checks.tail !== "string") {
    return 'checks must be { status: "pass" | "fail", tail }';
  }
  if (!Array.isArray(blocked)) return "blocked must be an array";
  if (!Array.isArray(planAmendments)) return "planAmendments must be an array";
  return {
    landed: landed as ImplementerReport["landed"],
    checks: { status: checks.status, tail: checks.tail },
    blocked,
    planAmendments,
  };
}

/**
 * An implementer's final message → its report: the first fenced block,
 * parsed and checked. Anything else makes the stream blocked, with the
 * text's tail quoted.
 */
export function parseImplementerReport(text: string | undefined): ParsedImplementerReport {
  const body = text ?? "";
  const block = firstFencedBlock(body);
  if (block === null) return { status: "blocked", reason: "no fenced report block", tail: tail(body) };
  let parsed: unknown;
  try {
    parsed = JSON.parse(block);
  } catch (error) {
    return { status: "blocked", reason: `report is not JSON: ${(error as Error).message}`, tail: tail(body) };
  }
  const report = checkImplementerReport(parsed);
  return typeof report === "string"
    ? { status: "blocked", reason: report, tail: tail(body) }
    : { status: "reported", report };
}

const WRAPPER = /^Agent \S+ answered:\s*$/;

function unavailable(line: string, unsettled: boolean): ParsedReviewerAnswer {
  return {
    verdict: "fix-first",
    findings: [
      {
        id: "reviewer-unavailable",
        severity: "high",
        scenario: `reviewer unavailable: ${line}`,
        change: "consult the reviewer again, or continue without a review on the person's word",
      },
    ],
    available: false,
    unsettled,
  };
}

/**
 * A consult answer → the reviewer's report. The platform wraps a completed
 * answer as `Agent <id> answered:` + the text; that line is skipped and the
 * first fenced block is the report. A non-JSON answer (failed, cancelled,
 * asking, not settled) → `fix-first` with one finding "reviewer unavailable:
 * <line>".
 */
export function parseReviewerAnswer(text: string | undefined): ParsedReviewerAnswer {
  const lines = (text ?? "").split("\n");
  const firstLine = (lines.find((line) => line.trim()) ?? "(empty answer)").trim();
  const unsettled = /did not settle/.test(text ?? "");
  if (!WRAPPER.test(firstLine)) return unavailable(firstLine, unsettled);
  const body = lines.slice(lines.findIndex((line) => WRAPPER.test(line.trim())) + 1).join("\n");
  const bodyLine = (body.split("\n").find((line) => line.trim()) ?? "(empty answer)").trim();
  const block = firstFencedBlock(body);
  if (block === null) return unavailable(bodyLine, unsettled);
  let parsed: unknown;
  try {
    parsed = JSON.parse(block);
  } catch {
    return unavailable(bodyLine, unsettled);
  }
  if (!isRecord(parsed) || (parsed.verdict !== "ship" && parsed.verdict !== "fix-first") || !Array.isArray(parsed.findings)) {
    return unavailable(bodyLine, unsettled);
  }
  const findings = parsed.findings.filter(isRecord).map(
    (finding, index): ReviewerFinding => ({
      id: typeof finding.id === "string" || typeof finding.id === "number" ? String(finding.id) : String(index + 1),
      severity: typeof finding.severity === "string" ? finding.severity : "medium",
      ...(typeof finding.file === "string" ? { file: finding.file } : {}),
      ...(typeof finding.line === "number" ? { line: finding.line } : {}),
      scenario: typeof finding.scenario === "string" ? finding.scenario : "",
      change: typeof finding.change === "string" ? finding.change : "",
    }),
  );
  return { verdict: parsed.verdict, findings, available: true, unsettled: false };
}
