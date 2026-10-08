/**
 * The figures grader: specific numbers a case requires the answer to state —
 * for instance both 0.22 and 0.25 when the documentation and the constants
 * disagree. Parsed exactly as grounding parses, so `0,22` counts.
 */

import { extractNumbers, NumberSet } from "@/lib/evals/numbers";
import type { GradedTurn } from "@/lib/evals/graders/input";
import type { GraderResult } from "@/lib/evals/types";

export function gradeFigures(turn: GradedTurn, required: number[]): GraderResult {
  const stated = new NumberSet(extractNumbers(turn.answer).flatMap((token) => token.readings));
  const missing = required.filter((figure) => !stated.has(figure));
  return {
    pass: missing.length === 0,
    reasons: missing.map((figure) => `required figure ${figure} not stated`),
  };
}
