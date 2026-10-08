/**
 * Applies the graders a case declares to one graded turn. Shared by the live
 * runner and offline re-grading, so both judge a turn identically.
 */

import { gradeAbstention } from "@/lib/evals/graders/abstention";
import { gradeCitation } from "@/lib/evals/graders/citation";
import { gradeFigures } from "@/lib/evals/graders/figures";
import { gradeGrounding } from "@/lib/evals/graders/grounding";
import { gradeHighlight } from "@/lib/evals/graders/highlight";
import type { GradedTurn } from "@/lib/evals/graders/input";
import { gradeTrajectory } from "@/lib/evals/graders/trajectory";
import type { Expectations, GraderName, GraderResult } from "@/lib/evals/types";

export interface CaseGrade {
  graders: Partial<Record<GraderName, GraderResult>>;
  /** Answer figures matched only by absolute value — recorded whenever grounding ran. */
  signOnly: number[];
  /** True when every declared grader passed. */
  pass: boolean;
}

export function gradeCase(expect: Expectations, turn: GradedTurn): CaseGrade {
  const graders: Partial<Record<GraderName, GraderResult>> = {};
  let signOnly: number[] = [];

  if (expect.trajectory) graders.trajectory = gradeTrajectory(turn, expect.trajectory);
  if (expect.highlight) graders.highlight = gradeHighlight(turn, expect.highlight);
  if (expect.grounding || expect.abstention) {
    const { sign_only, ...result } = gradeGrounding(turn);
    signOnly = sign_only;
    if (expect.grounding) graders.grounding = result;
  }
  if (expect.abstention) graders.abstention = gradeAbstention(turn);
  if (expect.figures) graders.figures = gradeFigures(turn, expect.figures);
  if (expect.citation) graders.citation = gradeCitation(turn);

  return { graders, signOnly, pass: Object.values(graders).every((result) => result.pass) };
}
