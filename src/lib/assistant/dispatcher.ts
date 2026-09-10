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
 * for the three tools that return plain data, or an array of content blocks
 * for documentation search. The two cannot share one shape: citations work
 * off structural `search_result` blocks, not off a string the model would
 * have to re-parse, so that tool's content is never stringified.
 */

import type Anthropic from "@anthropic-ai/sdk";

import { detailOpticalBudget, summarizeOpticalBudgets } from "@/lib/assistant/budgets";
import { searchDocumentation } from "@/lib/assistant/documentation-search";
import { getOpticalConstantsSnapshot } from "@/lib/assistant/optical-constants";
import {
  DETAIL_TOOL_NAME,
  GET_OPTICAL_CONSTANTS_TOOL_NAME,
  SEARCH_DOCUMENTATION_TOOL_NAME,
  SUMMARIZE_TOOL_NAME,
} from "@/lib/assistant/tool-definitions";
import type { SearchIndex } from "@/lib/corpus/search";
import type { Network } from "@/lib/network/types";

/** Parsed arguments of `summarize_optical_budgets`. */
interface SummarizeInput {
  min_margin_db?: number;
}

/** Parsed arguments of `detail_optical_budget`. */
interface DetailInput {
  nap_id: string;
  min_margin_db?: number;
}

/** Parsed arguments of `search_documentation`. */
interface SearchInput {
  query: string;
}

function isDetailInput(input: unknown): input is DetailInput {
  return typeof input === "object" && input !== null && typeof (input as DetailInput).nap_id === "string";
}

function isSearchInput(input: unknown): input is SearchInput {
  return typeof input === "object" && input !== null && typeof (input as SearchInput).query === "string";
}

export interface DispatchResult {
  content: Anthropic.ToolResultBlockParam["content"];
  isError: boolean;
}

const errorResult = (message: string): DispatchResult => ({
  content: JSON.stringify({ error: message }),
  isError: true,
});

/**
 * Runs the tool named `name` against `network` and `searchIndex`. Never
 * throws: a failure is reported as `{ content, isError: true }` for the
 * caller to wrap into a tool_result.
 */
export function dispatchTool(
  name: string,
  input: unknown,
  network: Network,
  searchIndex: SearchIndex,
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
): Anthropic.ToolResultBlockParam {
  const { content, isError } = dispatchTool(toolUse.name, toolUse.input, network, searchIndex);
  return {
    type: "tool_result",
    tool_use_id: toolUse.id,
    content,
    is_error: isError,
  };
}
