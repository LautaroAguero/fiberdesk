import { describe, expect, test } from "vitest";

import {
  DETAIL_TOOL_NAME,
  SEARCH_DOCUMENTATION_TOOL_NAME,
  SUMMARIZE_TOOL_NAME,
} from "@/lib/assistant/tool-definitions";
import { call, turn } from "@/lib/evals/graders/test-helpers";
import { gradeTrajectory } from "@/lib/evals/graders/trajectory";
import type { TrajectoryExpectation } from "@/lib/evals/types";

const surveyThenDetail: TrajectoryExpectation = {
  required: [SUMMARIZE_TOOL_NAME, DETAIL_TOOL_NAME],
  order: [[SUMMARIZE_TOOL_NAME, DETAIL_TOOL_NAME]],
};

describe("gradeTrajectory", () => {
  test("survey in iteration 1, detail ×2 in iteration 2 passes", () => {
    const toolCalls = [
      call(SUMMARIZE_TOOL_NAME, {}, 1),
      call(DETAIL_TOOL_NAME, { nap_id: "NAP-09" }, 2),
      call(DETAIL_TOOL_NAME, { nap_id: "NAP-12" }, 2),
    ];
    expect(gradeTrajectory(turn({ answer: "", toolCalls }), surveyThenDetail)).toEqual({ pass: true, reasons: [] });
  });

  test("detail before survey fails, naming the violated order", () => {
    const toolCalls = [call(DETAIL_TOOL_NAME, { nap_id: "NAP-09" }, 1), call(SUMMARIZE_TOOL_NAME, {}, 2)];
    const result = gradeTrajectory(turn({ answer: "", toolCalls }), surveyThenDetail);
    expect(result.pass).toBe(false);
    expect(result.reasons).toEqual([
      "order: summarize_optical_budgets (iteration 2) must come before detail_optical_budget (iteration 1)",
    ]);
  });

  test("both in one iteration does not satisfy an order constraint", () => {
    const toolCalls = [call(SUMMARIZE_TOOL_NAME, {}, 1), call(DETAIL_TOOL_NAME, { nap_id: "NAP-09" }, 1)];
    expect(gradeTrajectory(turn({ answer: "", toolCalls }), surveyThenDetail).pass).toBe(false);
  });

  test("a missing required tool fails", () => {
    const result = gradeTrajectory(turn({ answer: "", toolCalls: [call(SUMMARIZE_TOOL_NAME, {}, 1)] }), surveyThenDetail);
    expect(result.reasons).toEqual(["required: detail_optical_budget — not called"]);
  });

  test("an input match passes on min_margin_db 4 and fails on 3", () => {
    const expected: TrajectoryExpectation = { required: [{ tool: SUMMARIZE_TOOL_NAME, input: { min_margin_db: 4 } }] };
    expect(gradeTrajectory(turn({ answer: "", toolCalls: [call(SUMMARIZE_TOOL_NAME, { min_margin_db: 4 })] }), expected).pass).toBe(true);
    expect(gradeTrajectory(turn({ answer: "", toolCalls: [call(SUMMARIZE_TOOL_NAME, { min_margin_db: 3 })] }), expected).pass).toBe(false);
  });

  test("a forbidden tool fails", () => {
    const result = gradeTrajectory(
      turn({ answer: "", toolCalls: [call(SUMMARIZE_TOOL_NAME, {})] }),
      { forbidden: [SUMMARIZE_TOOL_NAME] },
    );
    expect(result.reasons).toEqual(["forbidden: summarize_optical_budgets was called"]);
  });

  test("required_any is met by any one of its tools", () => {
    const expected: TrajectoryExpectation = { required_any: [SUMMARIZE_TOOL_NAME, DETAIL_TOOL_NAME] };
    expect(gradeTrajectory(turn({ answer: "", toolCalls: [call(DETAIL_TOOL_NAME, { nap_id: "NAP-01" })] }), expected).pass).toBe(true);
    expect(gradeTrajectory(turn({ answer: "", toolCalls: [] }), expected).pass).toBe(false);
  });

  test("a search with matches satisfies nonempty_result; one with none does not", () => {
    const expected: TrajectoryExpectation = {
      required: [{ tool: SEARCH_DOCUMENTATION_TOOL_NAME, nonempty_result: true }],
    };
    const hit = call(SEARCH_DOCUMENTATION_TOOL_NAME, { query: "moisture water ingress attenuation" });
    const miss = call(SEARCH_DOCUMENTATION_TOOL_NAME, { query: "zzzz qqqq" });
    expect(gradeTrajectory(turn({ answer: "", toolCalls: [hit] }), expected).pass).toBe(true);
    expect(gradeTrajectory(turn({ answer: "", toolCalls: [miss] }), expected).pass).toBe(false);
  });
});
