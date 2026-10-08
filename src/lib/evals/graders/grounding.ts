/**
 * The grounding grader: every figure in the answer must be a number the
 * conversation's tool results or the user supplied. The project's core rule
 * — the model orchestrates, the code calculates — as an automatic check.
 *
 * It checks membership, not attribution: a real number attached to the wrong
 * NAP passes. What it catches is a figure the model invented, rounded or
 * re-derived. See design.md (add-eval-harness), decision 8, for the rules and
 * their known limits.
 */

import { extractNumbers, NumberSet, numbersInValue } from "@/lib/evals/numbers";
import type { GradedTurn } from "@/lib/evals/graders/input";
import type { GraderResult } from "@/lib/evals/types";

export interface GroundingResult extends GraderResult {
  /** Figures that matched a source only by absolute value — passed, but worth a human look. */
  sign_only: number[];
}

/**
 * Every number the answer may legitimately state: tool results, the tool
 * definitions (which code wrote — the survey's 3.00 dB default threshold
 * lives only there), and the user's own messages. The system prompt is
 * deliberately not a source.
 */
export function groundingSources(turn: GradedTurn): NumberSet {
  const sources = new NumberSet();
  numbersInValue(turn.toolDefinitions).forEach((n) => sources.add(n));
  for (const call of [...turn.priorToolCalls, ...turn.toolCalls]) {
    if (!call.isError) numbersInValue(call.result).forEach((n) => sources.add(n));
  }
  for (const message of turn.userMessages) numbersInValue(message).forEach((n) => sources.add(n));
  return sources;
}

export function gradeGrounding(turn: GradedTurn): GroundingResult {
  const sources = groundingSources(turn);
  const reasons: string[] = [];
  const signOnly: number[] = [];

  for (const token of extractNumbers(turn.answer)) {
    if (token.readings.some((value) => sources.has(value))) continue;
    const absMatch = token.readings.find((value) => sources.hasAbs(value));
    if (absMatch !== undefined) {
      signOnly.push(absMatch);
      continue;
    }
    reasons.push(`ungrounded figure ${token.text}`);
  }

  return { pass: reasons.length === 0, reasons, sign_only: signOnly };
}
