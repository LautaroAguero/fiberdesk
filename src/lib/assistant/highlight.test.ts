import { describe, expect, test } from "vitest";

import { dispatchTool } from "@/lib/assistant/dispatcher";
import { projectHighlight } from "@/lib/assistant/highlight";
import type { ToolCallRecord } from "@/lib/assistant/loop";
import {
  CUT_IMPACT_TOOL_NAME,
  DETAIL_TOOL_NAME,
  SUMMARIZE_TOOL_NAME,
  TRACE_TOOL_NAME,
} from "@/lib/assistant/tool-definitions";
import { buildSearchIndex } from "@/lib/corpus/search";
import { loadNetwork } from "@/lib/network/load";
import { cutImpact } from "@/lib/topology/cut";

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

describe("3.2 a traced subscriber is projected as a subscriber and its path", () => {
  test("SUB-025 gives a subscriber entry and FR-03/FR-12 marginal, and no NAP entry", () => {
    const payload = projectHighlight([record(TRACE_TOOL_NAME, { subscriber_id: "SUB-025" })]);

    expect(payload.highlight).toEqual([
      { kind: "subscriber", id: "SUB-025", nap_id: "NAP-12", status: "marginal", margin_db: 1.85 },
      { kind: "run", id: "FR-03", status: "marginal" },
      { kind: "run", id: "FR-12", status: "marginal" },
    ]);
    expect(payload.fit_bounds).toBe(true);
  });

  test("the subscriber status colours its path, not the NAP status (SUB-011 is marginal on a passing NAP-06)", () => {
    const payload = projectHighlight([record(TRACE_TOOL_NAME, { subscriber_id: "SUB-011" })]);

    expect(payload.highlight[0]).toEqual({
      kind: "subscriber",
      id: "SUB-011",
      nap_id: "NAP-06",
      status: "marginal",
      margin_db: 2.52,
    });
    expect(payload.highlight.filter((entry) => entry.kind === "nap")).toEqual([]);
    for (const entry of payload.highlight.filter((e) => e.kind === "run")) {
      expect(entry.status).toBe("marginal");
    }
  });

  test("tracing SUB-025 and detailing NAP-12 gives both entries and the shared runs once", () => {
    const payload = projectHighlight([
      record(TRACE_TOOL_NAME, { subscriber_id: "SUB-025" }),
      record(DETAIL_TOOL_NAME, { nap_id: "NAP-12" }),
    ]);

    expect(payload.highlight).toContainEqual({
      kind: "subscriber",
      id: "SUB-025",
      nap_id: "NAP-12",
      status: "marginal",
      margin_db: 1.85,
    });
    expect(payload.highlight).toContainEqual({ kind: "nap", id: "NAP-12", status: "marginal", margin_db: 2.77 });
    const runs = payload.highlight.filter((entry) => entry.kind === "run");
    expect(runs).toEqual([
      { kind: "run", id: "FR-03", status: "marginal" },
      { kind: "run", id: "FR-12", status: "marginal" },
    ]);
  });

  test("a traced pass subscriber on a shared path keeps the worse run status", () => {
    // SUB-006 passes (NAP-03); NAP-12 is marginal; both paths include FR-03.
    const payload = projectHighlight([
      record(TRACE_TOOL_NAME, { subscriber_id: "SUB-006" }),
      record(DETAIL_TOOL_NAME, { nap_id: "NAP-12" }),
    ]);
    expect(payload.highlight).toContainEqual({ kind: "run", id: "FR-03", status: "marginal" });
  });

  test("an errored trace contributes nothing", () => {
    const payload = projectHighlight([record(TRACE_TOOL_NAME, { subscriber_id: "SUB-099" })]);
    expect(payload.highlight).toEqual([]);
    expect(payload.fit_bounds).toBe(false);
  });
});

describe("2.2 a cut impact is projected as the cut element and what it takes out", () => {
  /** A cut-impact record built from the engine, as dispatch will in 3.2. */
  function cutRecord(elementId: string): ToolCallRecord {
    return {
      name: CUT_IMPACT_TOOL_NAME,
      input: { element_id: elementId },
      result: cutImpact(network, elementId),
      isError: false,
      iteration: 1,
    };
  }

  test("a cut through a cascade (FR-03)", () => {
    const payload = projectHighlight([cutRecord("FR-03")]);

    expect(payload.highlight).toEqual([
      { kind: "run", id: "FR-03", status: "cut" },
      { kind: "nap", id: "NAP-03", status: "out_of_service" },
      { kind: "nap", id: "NAP-12", status: "out_of_service" },
      { kind: "subscriber", id: "SUB-006", nap_id: "NAP-03", status: "out_of_service" },
      { kind: "subscriber", id: "SUB-025", nap_id: "NAP-12", status: "out_of_service" },
      { kind: "subscriber", id: "SUB-026", nap_id: "NAP-12", status: "out_of_service" },
      { kind: "subscriber", id: "SUB-027", nap_id: "NAP-12", status: "out_of_service" },
      { kind: "subscriber", id: "SUB-028", nap_id: "NAP-12", status: "out_of_service" },
      { kind: "run", id: "FR-12", status: "out_of_service" },
    ]);
    for (const entry of payload.highlight) expect(entry).not.toHaveProperty("margin_db");
    expect(payload.fit_bounds).toBe(true);
  });

  test("an outage outranks a budget classification (detail NAP-12, then cut FR-03)", () => {
    const payload = projectHighlight([
      record(DETAIL_TOOL_NAME, { nap_id: "NAP-12" }),
      cutRecord("FR-03"),
    ]);

    const nap12 = payload.highlight.filter((entry) => entry.kind === "nap" && entry.id === "NAP-12");
    expect(nap12).toEqual([{ kind: "nap", id: "NAP-12", status: "out_of_service" }]);
    const fr03 = payload.highlight.filter((entry) => entry.kind === "run" && entry.id === "FR-03");
    expect(fr03).toEqual([{ kind: "run", id: "FR-03", status: "cut" }]);
  });

  test("the order of the calls does not matter: a later detail does not undo the outage", () => {
    const payload = projectHighlight([
      cutRecord("FR-03"),
      record(DETAIL_TOOL_NAME, { nap_id: "NAP-12" }),
    ]);

    expect(payload.highlight.filter((e) => e.kind === "nap" && e.id === "NAP-12")).toEqual([
      { kind: "nap", id: "NAP-12", status: "out_of_service" },
    ]);
    expect(payload.highlight.filter((e) => e.kind === "run" && e.id === "FR-12")).toEqual([
      { kind: "run", id: "FR-12", status: "out_of_service" },
    ]);
  });

  test("a NAP cut: the NAP is cut, its feeder run is not listed", () => {
    const payload = projectHighlight([cutRecord("NAP-04")]);

    expect(payload.highlight).toContainEqual({ kind: "nap", id: "NAP-04", status: "cut" });
    expect(payload.highlight).toContainEqual({ kind: "nap", id: "NAP-09", status: "out_of_service" });
    expect(payload.highlight).toContainEqual({ kind: "run", id: "FR-09", status: "out_of_service" });
    expect(payload.highlight.filter((entry) => entry.id === "FR-04")).toEqual([]);
    expect(payload.highlight.filter((entry) => entry.id === "NAP-04")).toHaveLength(1);
    expect(payload.fit_bounds).toBe(true);
  });

  test("an errored cut call contributes nothing", () => {
    const payload = projectHighlight([
      { name: CUT_IMPACT_TOOL_NAME, input: { element_id: "FR-99" }, result: null, isError: true, iteration: 1 },
    ]);
    expect(payload.highlight).toEqual([]);
    expect(payload.fit_bounds).toBe(false);
  });

  test("fit_bounds is true for a cut run entry alone", () => {
    expect(projectHighlight([cutRecord("FR-12")]).fit_bounds).toBe(true);
  });
});
