/**
 * The two tools exposed to the model.
 *
 * Named for the shape of their answer, not the operation — see design.md,
 * decision 2. Their descriptions are the whole mechanism behind
 * survey-then-detail (decision 1): nothing in code sequences the two calls,
 * so the wording below has to carry that strategy on its own.
 *
 * Both schemas are `strict: true` (decision 3): the model's arguments are
 * valid by construction, not by validation after the fact. The detail
 * tool's identifier is an enum built from the loaded network, so an
 * identifier the dataset does not contain cannot be produced — see the cost
 * of that coupling in design.md, decision 3.
 */

import type Anthropic from "@anthropic-ai/sdk";

import type { Network } from "@/lib/network/types";

export const SUMMARIZE_TOOL_NAME = "summarize_optical_budgets";
export const DETAIL_TOOL_NAME = "detail_optical_budget";

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

  return [summarize, detail];
}
