import { describe, expect, test } from "vitest";

import { dispatchTool } from "@/lib/assistant/dispatcher";
import { projectHighlight } from "@/lib/assistant/highlight";
import type { ToolCallRecord } from "@/lib/assistant/loop";
import { DETAIL_TOOL_NAME, SUMMARIZE_TOOL_NAME } from "@/lib/assistant/tool-definitions";
import { buildSearchIndex } from "@/lib/corpus/search";
import { loadNetwork } from "@/lib/network/load";

const network = loadNetwork();
const searchIndex = buildSearchIndex([]); // empty: highlight projection never reads documentation results

/** Builds a ToolCallRecord the way loop.ts would, from a real dispatch. */
function record(name: string, input: unknown): ToolCallRecord {
  const { content, isError } = dispatchTool(name, input, network, searchIndex);
  return {
    name,
    input,
    result: isError ? null : typeof content === "string" ? JSON.parse(content) : content,
    isError,
  };
}

describe("6.1 the highlight is projected from tool results, never derived by the model", () => {
  test("a turn covering NAP-09 and NAP-12 yields exact margins", () => {
    const toolCalls = [
      record(DETAIL_TOOL_NAME, { nap_id: "NAP-09" }),
      record(DETAIL_TOOL_NAME, { nap_id: "NAP-12" }),
    ];

    const payload = projectHighlight(toolCalls);

    expect(payload.highlight).toContainEqual({ nap_id: "NAP-09", status: "fail", margin_db: -1.4 });
    expect(payload.highlight).toContainEqual({ nap_id: "NAP-12", status: "marginal", margin_db: 2.77 });
    expect(payload.fit_bounds).toBe(true);
  });

  test("a turn that calls no tools yields no entries and does not ask the map to reframe", () => {
    const payload = projectHighlight([]);
    expect(payload.highlight).toEqual([]);
    expect(payload.fit_bounds).toBe(false);
  });

  test("a summarize-only turn contributes no highlight entries", () => {
    const toolCalls = [record(SUMMARIZE_TOOL_NAME, {})];
    const payload = projectHighlight(toolCalls);
    expect(payload.highlight).toEqual([]);
    expect(payload.fit_bounds).toBe(false);
  });

  test("an errored detail call contributes no entry", () => {
    const toolCalls = [record(DETAIL_TOOL_NAME, { nap_id: "NAP-99" })];
    const payload = projectHighlight(toolCalls);
    expect(payload.highlight).toEqual([]);
  });

  test("a repeated detail call on the same NAP does not duplicate its entry", () => {
    const toolCalls = [record(DETAIL_TOOL_NAME, { nap_id: "NAP-12" }), record(DETAIL_TOOL_NAME, { nap_id: "NAP-12" })];
    const payload = projectHighlight(toolCalls);
    expect(payload.highlight).toHaveLength(1);
  });
});
