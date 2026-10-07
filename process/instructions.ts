/**
 * The process's public interface: each agent imports this from its
 * generated `process/instructions`. The lead's render passes the turn kind;
 * the stage is read by the model from `where_are_we` (work 040 "Stage
 * detection": the render runs before any tool, so it cannot know it).
 *
 * Order per turn: who you are, what this turn is, the rules the platform
 * imposes, the concepts, then reference shapes last (design 019 §2
 * "Guidance, not a harness").
 */
import { implementerText } from "./implementer";
import {
  CHANNEL_TURN_START,
  CONSULT_ANSWER_TURN,
  CONSULTING,
  DELEGATION,
  EVENT_TURN,
  FAILURES,
  MECHANICS,
  OPENING_TURN,
  REPOS_AND_DOCUMENTS,
  STAGES,
} from "./lead";
import { PHILOSOPHY } from "./philosophy";
import { reviewerText } from "./reviewer";
import { ROLES } from "./roles";
import { DOCUMENT_SHAPES, SHAPES } from "./shapes";

export { VERSION_MARKER } from "./shapes";
export { TOOL_NAMES } from "./reports";

export type LeadInput = { source: "channel" | "event" | "subagent"; firstTurn: boolean };

/** The lead's full instruction text for one turn kind. The turn-specific block comes first. */
export function leadInstructions(input: LeadInput): string {
  // work 040 "Stage detection": a channel turn with no prior lead message is the opening turn: answer, brief or one question
  if (input.source === "channel" && input.firstTurn) {
    return [ROLES.lead, OPENING_TURN, MECHANICS, PHILOSOPHY, SHAPES].join("\n\n");
  }
  // 019 §11 sequence step 6: event turns record and merge only
  if (input.source === "event") {
    return [ROLES.lead, EVENT_TURN, MECHANICS, FAILURES, DELEGATION, REPOS_AND_DOCUMENTS].join("\n\n");
  }
  // 019 §11 review loop: the consult answer arrives as a subagent input
  if (input.source === "subagent") {
    return [
      ROLES.lead,
      CONSULT_ANSWER_TURN,
      MECHANICS,
      FAILURES,
      CONSULTING,
      DELEGATION,
      REPOS_AND_DOCUMENTS,
      PHILOSOPHY,
      SHAPES,
      DOCUMENT_SHAPES,
    ].join("\n\n");
  }
  return [
    ROLES.lead,
    CHANNEL_TURN_START,
    STAGES,
    MECHANICS,
    FAILURES,
    DELEGATION,
    CONSULTING,
    REPOS_AND_DOCUMENTS,
    PHILOSOPHY,
    SHAPES,
    DOCUMENT_SHAPES,
  ].join("\n\n");
}

/** The implementer's instruction text; the assignment arrives as the turn payload. */
export function implementerInstructions(): string {
  return implementerText();
}

/** The reviewer's instruction text; the brief arrives as the consult prompt. */
export function reviewerInstructions(): string {
  return reviewerText();
}
