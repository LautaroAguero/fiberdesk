/**
 * The four tools exposed to the model.
 *
 * The first two are named for the shape of their answer, not the operation
 * — see design.md (add-optical-budget-engine), decision 2. Their
 * descriptions are the whole mechanism behind survey-then-detail (decision
 * 1): nothing in code sequences the two calls, so the wording below has to
 * carry that strategy on its own.
 *
 * All four schemas are `strict: true`: the model's arguments are valid by
 * construction, not by validation after the fact. The detail tool's
 * identifier is an enum built from the loaded network, so an identifier the
 * dataset does not contain cannot be produced — see the cost of that
 * coupling in design.md (add-optical-budget-engine), decision 3.
 *
 * The last two — search and constants — are added by add-documentation-search.
 * Their descriptions carry their own selection logic: the search tool states
 * the corpus is in English (design.md, decision 3), and the constants tool
 * states it returns configuration, not a specific NAP's measurements, so it
 * is not reached for on an ordinary budget question (design.md, Risks).
 */

import type Anthropic from "@anthropic-ai/sdk";

import type { Network } from "@/lib/network/types";

export const SUMMARIZE_TOOL_NAME = "summarize_optical_budgets";
export const DETAIL_TOOL_NAME = "detail_optical_budget";
export const SEARCH_DOCUMENTATION_TOOL_NAME = "search_documentation";
export const GET_OPTICAL_CONSTANTS_TOOL_NAME = "get_optical_constants";

/**
 * Builds both tool definitions against `network`. Rebuilt whenever the
 * network changes — which, with a static seed, is only at process start.
 */
export function buildToolDefinitions(network: Network): Anthropic.Tool[] {
  const napIds = network.splitters.map((nap) => nap.id);

  const summarize: Anthropic.Tool = {
    name: SUMMARIZE_TOOL_NAME,
    description:
      "Returns one row per NAP in the network: identifier, name, total attenuation, margin " +
      "and pass/marginal/fail status. Call this FIRST for any question about which links are " +
      "failing or marginal, or about the state of the network in general — it takes no " +
      "required arguments, so you do not need to know any NAP identifier in advance. " +
      "Optionally override the recommended minimum margin (default 3.00 dB) to reclassify " +
      "every row against a stricter or looser threshold.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        min_margin_db: {
          type: "number",
          description:
            "Minimum recommended margin in dB used to classify a link as marginal rather " +
            "than passing. Defaults to the project's standard 3.00 dB when omitted.",
        },
      },
      required: [],
      additionalProperties: false,
    },
  };

  const detail: Anthropic.Tool = {
    name: DETAIL_TOOL_NAME,
    description:
      "Returns the full optical loss breakdown for ONE NAP: totals per loss source (fiber, " +
      "splitters, connectors, splices) and a hop-by-hop attribution naming the fiber run and " +
      "splitter responsible for each contribution, including splitters inherited from an " +
      "upstream NAP in a cascade. Call this AFTER summarize_optical_budgets, only for the NAPs " +
      "you need to explain — it is the only source that can attribute a loss to a specific span.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        nap_id: {
          type: "string",
          enum: napIds,
          description: "Identifier of the NAP to break down, e.g. \"NAP-12\".",
        },
        min_margin_db: {
          type: "number",
          description:
            "Minimum recommended margin in dB used to classify this link. Defaults to the " +
            "project's standard 3.00 dB when omitted.",
        },
      },
      required: ["nap_id"],
      additionalProperties: false,
    },
  };

  const searchDocumentation: Anthropic.Tool = {
    name: SEARCH_DOCUMENTATION_TOOL_NAME,
    description:
      "Searches the project's technical documentation corpus, which is written in ENGLISH, " +
      "and returns the matching passages, each citable to the document it came from. If the " +
      "user's question is in another language, translate the concepts into an English query " +
      "before calling this — a query in the user's own language will likely match nothing. " +
      "Use this for questions about GPON deployment practice, specifications, or terminology " +
      "documented outside the network dataset itself — never for questions about a specific " +
      "NAP or its optical budget, which the other tools answer. Returns no results, not an " +
      "error, when the documentation does not cover the topic; say so rather than guessing.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            'An English search query — a few keywords or a short phrase, e.g. "cascaded ' +
            'splitter insertion loss".',
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  };

  const getOpticalConstants: Anthropic.Tool = {
    name: GET_OPTICAL_CONSTANTS_TOOL_NAME,
    description:
      "Returns the project's own optical constants — fiber attenuation, connector loss, " +
      "splice loss, splitter insertion loss per ratio, GPON class budgets, and the " +
      "recommended minimum margin — each with its unit and its standing as industry-typical " +
      "and pending validation. Call this to state what the system computes with, especially " +
      "when a documented figure needs to be compared against it. This returns configuration, " +
      "not a specific NAP's measurements — for an actual link's numbers, use " +
      "summarize_optical_budgets or detail_optical_budget instead. Takes no arguments.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  };

  return [summarize, detail, searchDocumentation, getOpticalConstants];
}
