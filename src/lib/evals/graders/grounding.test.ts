import { describe, expect, test } from "vitest";

import { DETAIL_TOOL_NAME, SUMMARIZE_TOOL_NAME } from "@/lib/assistant/tool-definitions";
import { gradeGrounding } from "@/lib/evals/graders/grounding";
import { call, turn } from "@/lib/evals/graders/test-helpers";

const details = () => [call(DETAIL_TOOL_NAME, { nap_id: "NAP-09" }), call(DETAIL_TOOL_NAME, { nap_id: "NAP-12" })];

describe("gradeGrounding", () => {
  test("figures reproduced exactly, in Spanish notation, pass; identifiers and ratios are not figures", () => {
    const result = gradeGrounding(
      turn({ answer: "NAP-09: margen −1,40 dB; NAP-12: margen 2.77 dB, splitter 1:16", toolCalls: details() }),
    );
    expect(result).toEqual({ pass: true, reasons: [], sign_only: [] });
  });

  test("a rounded figure is ungrounded", () => {
    const result = gradeGrounding(turn({ answer: "margen de 2,7 dB", toolCalls: details() }));
    expect(result.pass).toBe(false);
    expect(result.reasons).toEqual(["ungrounded figure 2,7"]);
  });

  test("a sum the model computed is ungrounded (FR-04 12 km + FR-09 8.8 km)", () => {
    const result = gradeGrounding(
      turn({ answer: "NAP-09 runs 12 km and then 8.8 km: over 20.8 km of fiber.", toolCalls: details() }),
    );
    expect(result.reasons).toEqual(["ungrounded figure 20.8"]);
  });

  test("a number the user supplied is grounded", () => {
    const result = gradeGrounding(
      turn({
        answer: "Con un umbral de 4 dB, NAP-06 (3.44 dB) también queda marginal.",
        toolCalls: [call(SUMMARIZE_TOOL_NAME, { min_margin_db: 4 })],
        userMessages: ["¿qué cajas quedan por debajo de 4 dB de margen?"],
      }),
    );
    expect(result.pass).toBe(true);
  });

  test("a sign-only match passes but is recorded", () => {
    const result = gradeGrounding(turn({ answer: "NAP-09 is 1.40 dB short of the budget.", toolCalls: details() }));
    expect(result.pass).toBe(true);
    expect(result.sign_only).toEqual([1.4]);
  });

  test("a figure fetched in an earlier turn is grounded in a follow-up", () => {
    const result = gradeGrounding(
      turn({ answer: "NAP-12 tiene un margen de 2,77 dB.", priorToolCalls: details(), toolCalls: [] }),
    );
    expect(result.pass).toBe(true);
  });

  test("an errored tool call grounds nothing", () => {
    const result = gradeGrounding(
      turn({ answer: "NAP-99 has 2.77 dB.", toolCalls: [call(DETAIL_TOOL_NAME, { nap_id: "NAP-99" })] }),
    );
    expect(result.reasons).toEqual(["ungrounded figure 2.77"]);
  });
});
