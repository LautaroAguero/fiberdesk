import { describe, expect, test } from "vitest";

import {
  buildToolDefinitions,
  DETAIL_TOOL_NAME,
  SUMMARIZE_TOOL_NAME,
} from "@/lib/assistant/tool-definitions";
import { loadNetwork } from "@/lib/network/load";

const network = loadNetwork();
const tools = buildToolDefinitions(network);
const summarize = tools.find((t) => t.name === SUMMARIZE_TOOL_NAME)!;
const detail = tools.find((t) => t.name === DETAIL_TOOL_NAME)!;

describe("2.4 strict schemas and the identifier enum", () => {
  test("both tools declare strict: true", () => {
    expect(summarize.strict).toBe(true);
    expect(detail.strict).toBe(true);
  });

  test("both schemas forbid additional properties", () => {
    expect(summarize.input_schema.additionalProperties).toBe(false);
    expect(detail.input_schema.additionalProperties).toBe(false);
  });

  test("the summary tool requires no arguments", () => {
    expect(summarize.input_schema.required).toEqual([]);
  });

  test("the detail tool's identifier enum holds exactly the twelve seed identifiers", () => {
    const properties = detail.input_schema.properties as { nap_id: { enum: string[] } };
    expect(properties.nap_id.enum).toHaveLength(12);
    expect(properties.nap_id.enum.sort()).toEqual(network.splitters.map((s) => s.id).sort());
  });

  test("NAP-99 is not among the valid identifiers", () => {
    const properties = detail.input_schema.properties as { nap_id: { enum: string[] } };
    expect(properties.nap_id.enum).not.toContain("NAP-99");
  });

  test("the detail tool requires nap_id", () => {
    expect(detail.input_schema.required).toEqual(["nap_id"]);
  });
});

describe("2.5 descriptions carry the survey-then-detail strategy", () => {
  test("the summary tool's description says to call it first", () => {
    expect(summarize.description).toMatch(/FIRST/);
  });

  test("the detail tool's description says to call it after the summary", () => {
    expect(detail.description).toMatch(/AFTER/);
    expect(detail.description).toContain(SUMMARIZE_TOOL_NAME);
  });

  test("the detail tool's description explains what only it can do", () => {
    expect(detail.description!.toLowerCase()).toContain("attribute");
  });
});
