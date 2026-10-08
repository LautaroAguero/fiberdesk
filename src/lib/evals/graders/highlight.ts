/**
 * The highlight grader: the entities in the payload the server projected,
 * against a hand-written oracle set. Applied only where the reference
 * behaviour requires a detail call — a survey-only answer projects nothing,
 * by design. See design.md (add-eval-harness), decision 7.
 */

import type { HighlightPayload } from "@/lib/assistant/events";
import type { GradedTurn } from "@/lib/evals/graders/input";
import type { GraderResult, HighlightExpectation } from "@/lib/evals/types";

/** The entity ids a payload highlights. */
export function highlightIds(payload: HighlightPayload): string[] {
  return payload.highlight.map((entry) => entry.nap_id);
}

export function gradeHighlight(turn: GradedTurn, expected: HighlightExpectation): GraderResult {
  const actual = new Set(highlightIds(turn.payload));
  const oracle = new Set(expected.ids);
  const reasons: string[] = [];

  const missing = [...oracle].filter((id) => !actual.has(id));
  if (missing.length > 0) reasons.push(`missing from highlight: ${missing.join(", ")}`);

  if (expected.mode === "equals") {
    const unexpected = [...actual].filter((id) => !oracle.has(id));
    if (unexpected.length > 0) reasons.push(`unexpected in highlight: ${unexpected.join(", ")}`);
  }

  return { pass: reasons.length === 0, reasons };
}
