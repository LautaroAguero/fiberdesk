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
    iteration: 1,
  };
}

describe("6.1 the highlight is projected from tool results, never derived by the model", () => {
  test("a turn covering NAP-09 and NAP-12 yields exact margins", () => {
    const toolCalls = [
      record(DETAIL_TOOL_NAME, { nap_id: "NAP-09" }),
      record(DETAIL_TOOL_NAME, { nap_id: "NAP-12" }),
    ];

    const payload = projectHighlight(toolCalls);

    expect(payload.highlight).toContainEqual({ kind: "nap", id: "NAP-09", status: "fail", margin_db: -1.4 });
    expect(payload.highlight).toContainEqual({ kind: "nap", id: "NAP-12", status: "marginal", margin_db: 2.77 });
    expect(payload.fit_bounds).toBe(true);
  });

  test("the runs on each path are entries too, classified as their NAP", () => {
    const payload = projectHighlight([
      record(DETAIL_TOOL_NAME, { nap_id: "NAP-09" }),
      record(DETAIL_TOOL_NAME, { nap_id: "NAP-12" }),
    ]);

    const runs = payload.highlight.filter((entry) => entry.kind === "run");
    expect(runs).toContainEqual({ kind: "run", id: "FR-04", status: "fail" });
    expect(runs).toContainEqual({ kind: "run", id: "FR-09", status: "fail" });
    expect(runs).toContainEqual({ kind: "run", id: "FR-03", status: "marginal" });
    expect(runs).toContainEqual({ kind: "run", id: "FR-12", status: "marginal" });
    expect(runs).toHaveLength(4);
  });

  test("two details that share a run keep the worse status", () => {
    // NAP-12 (marginal) hangs from NAP-03 (pass): both paths include FR-03.
    const payload = projectHighlight([
      record(DETAIL_TOOL_NAME, { nap_id: "NAP-03" }),
      record(DETAIL_TOOL_NAME, { nap_id: "NAP-12" }),
    ]);
    const fr03 = payload.highlight.filter((entry) => entry.kind === "run" && entry.id === "FR-03");
    expect(fr03).toEqual([{ kind: "run", id: "FR-03", status: "marginal" }]);

    // And in the opposite order.
    const reversed = projectHighlight([
      record(DETAIL_TOOL_NAME, { nap_id: "NAP-12" }),
      record(DETAIL_TOOL_NAME, { nap_id: "NAP-03" }),
    ]);
    const fr03Again = reversed.highlight.filter((entry) => entry.kind === "run" && entry.id === "FR-03");
    expect(fr03Again).toEqual([{ kind: "run", id: "FR-03", status: "marginal" }]);
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
    expect(payload.highlight.filter((entry) => entry.kind === "nap")).toHaveLength(1);
    expect(payload.highlight).toHaveLength(3); // NAP-12 plus FR-03 and FR-12, each once
  });
});
