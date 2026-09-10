import { describe, expect, test, vi } from "vitest";

import { dispatchTool, runToolUse } from "@/lib/assistant/dispatcher";
import { DETAIL_TOOL_NAME, SUMMARIZE_TOOL_NAME } from "@/lib/assistant/tool-definitions";
import { loadNetwork } from "@/lib/network/load";
import * as budgets from "@/lib/assistant/budgets";

const network = loadNetwork();

describe("3.1 dispatch covers both tools", () => {
  test("summarize_optical_budgets returns 12 rows", () => {
    const result = dispatchTool(SUMMARIZE_TOOL_NAME, {}, network);
    expect(result.isError).toBe(false);
    expect(result.content).toHaveLength(12);
  });

  test("summarize_optical_budgets honours a minimum-margin override", () => {
    const result = dispatchTool(SUMMARIZE_TOOL_NAME, { min_margin_db: 5.0 }, network);
    const rows = result.content as budgets.SummaryRow[];
    expect(rows.find((r) => r.nap_id === "NAP-06")?.status).toBe("marginal");
  });

  test("detail_optical_budget returns the full breakdown for one NAP", () => {
    const result = dispatchTool(DETAIL_TOOL_NAME, { nap_id: "NAP-12" }, network);
    expect(result.isError).toBe(false);
    expect(result.content).toMatchObject({ nap_id: "NAP-12", total_loss_db: 25.23 });
  });
});

describe("3.2 error paths", () => {
  test("an unknown tool name yields an errored result naming it", () => {
    const result = dispatchTool("not_a_real_tool", {}, network);
    expect(result.isError).toBe(true);
    expect(result.content).toMatchObject({ error: expect.stringContaining("not_a_real_tool") });
  });

  test("a detail call missing nap_id is an error, not a crash", () => {
    const result = dispatchTool(DETAIL_TOOL_NAME, {}, network);
    expect(result.isError).toBe(true);
  });

  test("an adapter that throws (unknown NAP) is caught and reported as an error", () => {
    const result = dispatchTool(DETAIL_TOOL_NAME, { nap_id: "NAP-99" }, network);
    expect(result.isError).toBe(true);
    expect(result.content).toMatchObject({ error: expect.stringContaining("NAP-99") });
  });

  test("no adapter outside the known set is reached for an unknown tool", () => {
    const summarizeSpy = vi.spyOn(budgets, "summarizeOpticalBudgets");
    const detailSpy = vi.spyOn(budgets, "detailOpticalBudget");

    dispatchTool("not_a_real_tool", {}, network);

    expect(summarizeSpy).not.toHaveBeenCalled();
    expect(detailSpy).not.toHaveBeenCalled();

    summarizeSpy.mockRestore();
    detailSpy.mockRestore();
  });

  test("runToolUse packages an error result with is_error true", () => {
    const block = { type: "tool_use" as const, id: "toolu_1", name: "not_a_real_tool", input: {}, caller: { type: "direct" as const } };
    const result = runToolUse(block, network);
    expect(result.is_error).toBe(true);
    expect(result.tool_use_id).toBe("toolu_1");
  });

  test("runToolUse packages a success result as JSON content", () => {
    const block = {
      type: "tool_use" as const,
      id: "toolu_2",
      name: SUMMARIZE_TOOL_NAME,
      input: {},
      caller: { type: "direct" as const },
    };
    const result = runToolUse(block, network);
    expect(result.is_error).toBe(false);
    expect(JSON.parse(result.content as string)).toHaveLength(12);
  });
});
