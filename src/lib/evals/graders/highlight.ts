/**
 * The highlight grader: the NAPs, subscribers and cut runs in the payload the
 * server projected, against a hand-written oracle set. Other run entries only
 * describe the paths or the downstream set of those subjects and are not
 * compared (design.md, add-subscriber-trace, decision 9). A run whose status is
 * `cut` is the subject of its answer, so it is compared (design.md,
 * add-cut-impact, decision 7). Applied only where the reference
 * behaviour requires a detail call — a survey-only answer projects nothing,
 * by design. See design.md (add-eval-harness), decision 7.
 */

import type { HighlightPayload } from "@/lib/assistant/events";
import type { GradedTurn } from "@/lib/evals/graders/input";
import type { GraderResult, HighlightExpectation } from "@/lib/evals/types";

/**
 * The entity ids a payload highlights: NAPs, subscribers and cut runs. The other
 * runs, which describe a path or go dark downstream of a cut, are not included.
 */
export function highlightIds(payload: HighlightPayload): string[] {
  return payload.highlight
    .filter((entry) => entry.kind !== "run" || entry.status === "cut")
    .map((entry) => entry.id);
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
