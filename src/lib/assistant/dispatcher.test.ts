import { describe, expect, test, vi } from "vitest";

import { dispatchTool, runToolUse } from "@/lib/assistant/dispatcher";
import * as budgets from "@/lib/assistant/budgets";
import * as documentationSearch from "@/lib/assistant/documentation-search";
import {
  DETAIL_TOOL_NAME,
  GET_OPTICAL_CONSTANTS_TOOL_NAME,
  SEARCH_DOCUMENTATION_TOOL_NAME,
  SUMMARIZE_TOOL_NAME,
} from "@/lib/assistant/tool-definitions";
import { buildSearchIndex } from "@/lib/corpus/search";
import { loadCorpus } from "@/lib/corpus/load";
import { loadNetwork } from "@/lib/network/load";

const network = loadNetwork();
const searchIndex = buildSearchIndex(loadCorpus());

describe("3.1 dispatch covers the optical budget tools", () => {
  test("summarize_optical_budgets returns 12 rows as JSON", () => {
    const result = dispatchTool(SUMMARIZE_TOOL_NAME, {}, network, searchIndex);
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content as string)).toHaveLength(12);
  });

  test("summarize_optical_budgets honours a minimum-margin override", () => {
    const result = dispatchTool(SUMMARIZE_TOOL_NAME, { min_margin_db: 5.0 }, network, searchIndex);
    const rows = JSON.parse(result.content as string) as budgets.SummaryRow[];
    expect(rows.find((r) => r.nap_id === "NAP-06")?.status).toBe("marginal");
  });

  test("detail_optical_budget returns the full breakdown for one NAP", () => {
    const result = dispatchTool(DETAIL_TOOL_NAME, { nap_id: "NAP-12" }, network, searchIndex);
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content as string)).toMatchObject({
      nap_id: "NAP-12",
      total_loss_db: 25.23,
    });
  });
});

describe("5.3 dispatch covers the documentation tools", () => {
  test("search_documentation returns citable search_result blocks for a match", () => {
    const result = dispatchTool(
      SEARCH_DOCUMENTATION_TOOL_NAME,
      { query: "cascaded splitter insertion loss" },
      network,
      searchIndex,
    );

    expect(result.isError).toBe(false);
    const blocks = result.content as Array<{ type: string }>;
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0].type).toBe("search_result");
  });

  test("search_documentation returns a clear no-match signal rather than an empty array", () => {
    const result = dispatchTool(
      SEARCH_DOCUMENTATION_TOOL_NAME,
      { query: "xylophone quasar nonexistent" },
      network,
      searchIndex,
    );

    expect(result.isError).toBe(false);
    const blocks = result.content as Array<{ type: string; text?: string }>;
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("text");
  });

  test("search_documentation content is never a JSON string", () => {
    const result = dispatchTool(
      SEARCH_DOCUMENTATION_TOOL_NAME,
      { query: "splitter" },
      network,
      searchIndex,
    );
    expect(Array.isArray(result.content)).toBe(true);
  });

  test("get_optical_constants returns the constants as JSON", () => {
    const result = dispatchTool(GET_OPTICAL_CONSTANTS_TOOL_NAME, {}, network, searchIndex);
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content as string)).toMatchObject({
      fiber_attenuation: { value: 0.25, unit: "dB/km" },
    });
  });
});

describe("3.2 / 5.3 error paths", () => {
  test("an unknown tool name yields an errored JSON result naming it", () => {
    const result = dispatchTool("not_a_real_tool", {}, network, searchIndex);
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content as string)).toMatchObject({
      error: expect.stringContaining("not_a_real_tool"),
    });
  });

  test("a detail call missing nap_id is an error, not a crash", () => {
    const result = dispatchTool(DETAIL_TOOL_NAME, {}, network, searchIndex);
    expect(result.isError).toBe(true);
  });

  test("an adapter that throws (unknown NAP) is caught and reported as an error", () => {
    const result = dispatchTool(DETAIL_TOOL_NAME, { nap_id: "NAP-99" }, network, searchIndex);
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content as string)).toMatchObject({
      error: expect.stringContaining("NAP-99"),
    });
  });

  test("a search call missing query is an error, not a crash", () => {
    const result = dispatchTool(SEARCH_DOCUMENTATION_TOOL_NAME, {}, network, searchIndex);
    expect(result.isError).toBe(true);
  });

  test("an unknown argument shape does not crash any tool", () => {
    for (const name of [
      SUMMARIZE_TOOL_NAME,
      DETAIL_TOOL_NAME,
      SEARCH_DOCUMENTATION_TOOL_NAME,
      GET_OPTICAL_CONSTANTS_TOOL_NAME,
    ]) {
      expect(() => dispatchTool(name, { unexpected: "shape" }, network, searchIndex)).not.toThrow();
    }
  });

  test("no adapter outside the known set is reached for an unknown tool", () => {
    const summarizeSpy = vi.spyOn(budgets, "summarizeOpticalBudgets");
    const detailSpy = vi.spyOn(budgets, "detailOpticalBudget");
    const searchSpy = vi.spyOn(documentationSearch, "searchDocumentation");

    dispatchTool("not_a_real_tool", {}, network, searchIndex);

    expect(summarizeSpy).not.toHaveBeenCalled();
    expect(detailSpy).not.toHaveBeenCalled();
    expect(searchSpy).not.toHaveBeenCalled();

    summarizeSpy.mockRestore();
    detailSpy.mockRestore();
    searchSpy.mockRestore();
  });

  test("runToolUse packages an error result with is_error true", () => {
    const block = {
      type: "tool_use" as const,
      id: "toolu_1",
      name: "not_a_real_tool",
      input: {},
      caller: { type: "direct" as const },
    };
    const result = runToolUse(block, network, searchIndex);
    expect(result.is_error).toBe(true);
    expect(result.tool_use_id).toBe("toolu_1");
  });

  test("runToolUse packages a success result as JSON content for summarize", () => {
    const block = {
      type: "tool_use" as const,
      id: "toolu_2",
      name: SUMMARIZE_TOOL_NAME,
      input: {},
      caller: { type: "direct" as const },
    };
    const result = runToolUse(block, network, searchIndex);
    expect(result.is_error).toBe(false);
    expect(JSON.parse(result.content as string)).toHaveLength(12);
  });

  test("runToolUse packages a success result as content blocks for search_documentation", () => {
    const block = {
      type: "tool_use" as const,
      id: "toolu_3",
      name: SEARCH_DOCUMENTATION_TOOL_NAME,
      input: { query: "cascaded splitter" },
      caller: { type: "direct" as const },
    };
    const result = runToolUse(block, network, searchIndex);
    expect(result.is_error).toBe(false);
    expect(Array.isArray(result.content)).toBe(true);
  });
});
