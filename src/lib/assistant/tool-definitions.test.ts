import { describe, expect, test } from "vitest";

import {
  buildToolDefinitions,
  DETAIL_TOOL_NAME,
  GET_OPTICAL_CONSTANTS_TOOL_NAME,
  SEARCH_DOCUMENTATION_TOOL_NAME,
  SUMMARIZE_TOOL_NAME,
} from "@/lib/assistant/tool-definitions";
import { loadNetwork } from "@/lib/network/load";

const network = loadNetwork();
const tools = buildToolDefinitions(network);
const summarize = tools.find((t) => t.name === SUMMARIZE_TOOL_NAME)!;
const detail = tools.find((t) => t.name === DETAIL_TOOL_NAME)!;
const searchDocs = tools.find((t) => t.name === SEARCH_DOCUMENTATION_TOOL_NAME)!;
const getConstants = tools.find((t) => t.name === GET_OPTICAL_CONSTANTS_TOOL_NAME)!;

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

describe("5.1 the documentation search tool", () => {
  test("declares strict: true and forbids additional properties", () => {
    expect(searchDocs.strict).toBe(true);
    expect(searchDocs.input_schema.additionalProperties).toBe(false);
  });

  test("requires a query", () => {
    expect(searchDocs.input_schema.required).toEqual(["query"]);
    const properties = searchDocs.input_schema.properties as { query: { type: string } };
    expect(properties.query.type).toBe("string");
  });

  test("the description states the corpus is in English", () => {
    expect(searchDocs.description).toMatch(/ENGLISH/);
  });

  test("the description tells the model not to use it for a NAP's own budget", () => {
    expect(searchDocs.description!.toLowerCase()).toContain("never for questions about a specific");
  });
});

describe("5.2 the optical constants tool", () => {
  test("declares strict: true, takes no arguments", () => {
    expect(getConstants.strict).toBe(true);
    expect(getConstants.input_schema.required).toEqual([]);
    expect(getConstants.input_schema.additionalProperties).toBe(false);
  });

  test("the description distinguishes it from a NAP's own budget tools", () => {
    expect(getConstants.description!.toLowerCase()).toContain("not a specific nap's measurements");
  });
});
