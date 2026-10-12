/**
 * Maps a tool_use block to the adapter it names, and back to a tool_result.
 *
 * A failure — an unknown tool name, or an adapter that throws — never aborts
 * the request. It becomes an errored tool result instead, so the assistant
 * can see what went wrong and explain it, and the loop simply continues.
 * See design.md and specs/network-assistant/spec.md, "Failures reach the
 * user rather than being swallowed".
 *
 * `content` is `Anthropic.ToolResultBlockParam["content"]` — a JSON string
 * for the five tools that return plain data, or an array of content blocks
 * for documentation search. The two cannot share one shape: citations work
 * off structural `search_result` blocks, not off a string the model would
 * have to re-parse, so that tool's content is never stringified.
 */

import type Anthropic from "@anthropic-ai/sdk";

import { detailOpticalBudget, summarizeOpticalBudgets } from "@/lib/assistant/budgets";
import { searchDocumentation } from "@/lib/assistant/documentation-search";
import type { MapContext } from "@/lib/assistant/map-context";
import { getOpticalConstantsSnapshot } from "@/lib/assistant/optical-constants";
import {
  CONNECTION_CANDIDATES_TOOL_NAME,
  CUT_IMPACT_TOOL_NAME,
  DETAIL_TOOL_NAME,
  GET_OPTICAL_CONSTANTS_TOOL_NAME,
  SEARCH_DOCUMENTATION_TOOL_NAME,
  SUMMARIZE_TOOL_NAME,
  TRACE_TOOL_NAME,
} from "@/lib/assistant/tool-definitions";
import type { SearchIndex } from "@/lib/corpus/search";
import { evaluateConnection } from "@/lib/feasibility/feasibility";
import type { Network } from "@/lib/network/types";
import { traceSubscriber } from "@/lib/optical/trace";
import { cutImpact } from "@/lib/topology/cut";

/** Parsed arguments of `summarize_optical_budgets`. */
interface SummarizeInput {
  min_margin_db?: number;
}

/** Parsed arguments of `detail_optical_budget`. */
interface DetailInput {
  nap_id: string;
  min_margin_db?: number;
}

/** Parsed arguments of `trace_subscriber_link`. */
interface TraceInput {
  subscriber_id: string;
}

/** Parsed arguments of `list_cut_impact`. */
interface CutImpactInput {
  element_id: string;
}

/** Parsed arguments of `search_documentation`. */
interface SearchInput {
  query: string;
}

function isDetailInput(input: unknown): input is DetailInput {
  return typeof input === "object" && input !== null && typeof (input as DetailInput).nap_id === "string";
}

function isTraceInput(input: unknown): input is TraceInput {
  return typeof input === "object" && input !== null && typeof (input as TraceInput).subscriber_id === "string";
}

function isCutImpactInput(input: unknown): input is CutImpactInput {
  return typeof input === "object" && input !== null && typeof (input as CutImpactInput).element_id === "string";
}

function isSearchInput(input: unknown): input is SearchInput {
  return typeof input === "object" && input !== null && typeof (input as SearchInput).query === "string";
}

export interface DispatchResult {
  content: Anthropic.ToolResultBlockParam["content"];
  isError: boolean;
}

/** What the model reads when it asks about a location and the user has not clicked one. */
export const NO_POINT_MESSAGE =
  "No point is selected on the map. Ask the user to click the map where the new customer " +
  "would connect. Do not guess a location.";

const errorResult = (message: string): DispatchResult => ({
  content: JSON.stringify({ error: message }),
  isError: true,
});

/**
 * Runs the tool named `name` against `network` and `searchIndex`. Never
 * throws: a failure is reported as `{ content, isError: true }` for the
 * caller to wrap into a tool_result.
 *
 * `mapContext` is the request's map state, for a tool that evaluates what the
 * user selected rather than an argument the model wrote. It defaults to no
 * point, so every caller that predates it is unchanged. See design.md
 * (add-feasibility), decision 5.
 */
export function dispatchTool(
  name: string,
  input: unknown,
  network: Network,
  searchIndex: SearchIndex,
  mapContext: MapContext = {},
): DispatchResult {
  try {
    switch (name) {
      case SUMMARIZE_TOOL_NAME: {
        const { min_margin_db } = (input ?? {}) as SummarizeInput;
        return {
          content: JSON.stringify(summarizeOpticalBudgets(network, { minMarginDb: min_margin_db })),
          isError: false,
        };
      }
      case DETAIL_TOOL_NAME: {
        if (!isDetailInput(input)) {
          return errorResult("detail_optical_budget requires a nap_id");
        }
        return {
          content: JSON.stringify(
            detailOpticalBudget(network, input.nap_id, { minMarginDb: input.min_margin_db }),
          ),
          isError: false,
        };
      }
      case TRACE_TOOL_NAME: {
        if (!isTraceInput(input)) {
          return errorResult("trace_subscriber_link requires a subscriber_id");
        }
        // An id the network lacks makes the engine throw, naming it: the catch below
        // turns that into an errored result, never a zeroed or partial trace.
        return { content: JSON.stringify(traceSubscriber(network, input.subscriber_id)), isError: false };
      }
      case CUT_IMPACT_TOOL_NAME: {
        if (!isCutImpactInput(input)) {
          return errorResult("list_cut_impact requires an element_id");
        }
        // The OLT and any id the network lacks make the engine throw with a plain
        // message: the catch below turns it into an errored result, never an empty
        // or guessed impact.
        return { content: JSON.stringify(cutImpact(network, input.element_id)), isError: false };
      }
      case CONNECTION_CANDIDATES_TOOL_NAME: {
        // No arguments: the point is the one the user selected, read from the request
        // (design.md, add-feasibility, decision 5). The model never supplies a coordinate.
        const point = mapContext.selected_point;
        if (point === undefined) {
          return errorResult(NO_POINT_MESSAGE);
        }
        return { content: JSON.stringify(evaluateConnection(network, point)), isError: false };
      }
      case SEARCH_DOCUMENTATION_TOOL_NAME: {
        if (!isSearchInput(input)) {
          return errorResult("search_documentation requires a query");
        }
        const blocks = searchDocumentation(searchIndex, input.query);
        return {
          content:
            blocks.length > 0
              ? blocks
              : [{ type: "text", text: "No documentation sections matched this query." }],
          isError: false,
        };
      }
      case GET_OPTICAL_CONSTANTS_TOOL_NAME:
        return { content: JSON.stringify(getOpticalConstantsSnapshot()), isError: false };
      default:
        return errorResult(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : String(error));
  }
}

/** Runs `toolUse` and packages the result as the `tool_result` block the API expects. */
export function runToolUse(
  toolUse: Anthropic.ToolUseBlock,
  network: Network,
  searchIndex: SearchIndex,
  mapContext: MapContext = {},
): Anthropic.ToolResultBlockParam {
  const { content, isError } = dispatchTool(toolUse.name, toolUse.input, network, searchIndex, mapContext);
  return {
    type: "tool_result",
    tool_use_id: toolUse.id,
    content,
    is_error: isError,
  };
}
