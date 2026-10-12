import { describe, expect, test } from "vitest";

import {
  buildToolDefinitions,
  DETAIL_TOOL_NAME,
  GET_OPTICAL_CONSTANTS_TOOL_NAME,
  SEARCH_DOCUMENTATION_TOOL_NAME,
  SUMMARIZE_TOOL_NAME,
  TRACE_TOOL_NAME,
} from "@/lib/assistant/tool-definitions";
import { loadNetwork } from "@/lib/network/load";

const network = loadNetwork();
const tools = buildToolDefinitions(network);
const summarize = tools.find((t) => t.name === SUMMARIZE_TOOL_NAME)!;
const detail = tools.find((t) => t.name === DETAIL_TOOL_NAME)!;
const searchDocs = tools.find((t) => t.name === SEARCH_DOCUMENTATION_TOOL_NAME)!;
const getConstants = tools.find((t) => t.name === GET_OPTICAL_CONSTANTS_TOOL_NAME)!;
const trace = tools.find((t) => t.name === TRACE_TOOL_NAME)!;

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

describe("3.1 the subscriber trace tool", () => {
  test("is the fifth tool, and there are five", () => {
    expect(tools).toHaveLength(5);
    expect(trace.name).toBe("trace_subscriber_link");
  });

  test("declares strict: true and forbids additional properties", () => {
    expect(trace.strict).toBe(true);
    expect(trace.input_schema.additionalProperties).toBe(false);
  });

  test("requires subscriber_id, an enum of exactly the 28 seed identifiers", () => {
    expect(trace.input_schema.required).toEqual(["subscriber_id"]);
    const properties = trace.input_schema.properties as { subscriber_id: { enum: string[] } };
    expect(properties.subscriber_id.enum).toHaveLength(28);
    expect([...properties.subscriber_id.enum].sort()).toEqual(network.subscribers.map((s) => s.id).sort());
    expect(properties.subscriber_id.enum).not.toContain("SUB-099");
    expect(Object.keys(properties)).toEqual(["subscriber_id"]);
  });

  test("the description names the SUB-014 and Subscriber 014 correspondence", () => {
    expect(trace.description).toContain("SUB-014");
    expect(trace.description).toContain("Subscriber 014");
  });

  test("the description forbids calling it for a subscriber the network lacks", () => {
    // A live run traced SUB-001 for a question about SUB-099 (add-subscriber-trace,
    // verification.md); the rule sits where the model reads it when choosing the tool.
    expect(trace.description).toContain("do NOT call this tool");
    expect(trace.description).toContain("not with another identifier");
  });

  test("the description says a passing NAP does not vouch for its subscribers, and the drop is modelled", () => {
    expect(trace.description!.toLowerCase()).toContain("passing nap does not mean");
    expect(trace.description!.toLowerCase()).toContain("modelled estimate");
  });
});
