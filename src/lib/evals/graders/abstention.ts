/**
 * The abstention grader, for questions the system should decline: nothing
 * highlighted, and no figure the tools did not supply. Composed from the
 * highlight and grounding rules rather than checked separately, so it
 * inherits the grounding grader's hand validation. It does not read whether
 * the prose actually declines — that would need a judge, a later change.
 */

import { gradeGrounding } from "@/lib/evals/graders/grounding";
import { highlightIds } from "@/lib/evals/graders/highlight";
import type { GradedTurn } from "@/lib/evals/graders/input";
import type { GraderResult } from "@/lib/evals/types";

export function gradeAbstention(turn: GradedTurn): GraderResult {
  const reasons: string[] = [];
  const highlighted = highlightIds(turn.payload);
  if (highlighted.length > 0) reasons.push(`a declined question highlighted ${highlighted.join(", ")}`);
  reasons.push(...gradeGrounding(turn).reasons);
  return { pass: reasons.length === 0, reasons };
}
