/**
 * Maps a tool_use block to the adapter it names, and back to a tool_result.
 *
 * A failure — an unknown tool name, or an adapter that throws — never aborts
 * the request. It becomes an errored tool result instead, so the assistant
 * can see what went wrong and explain it, and the loop simply continues.
 * See design.md and specs/network-assistant/spec.md, "Failures reach the
 * user rather than being swallowed".
 */

import type Anthropic from "@anthropic-ai/sdk";

import { detailOpticalBudget, summarizeOpticalBudgets } from "@/lib/assistant/budgets";
import { DETAIL_TOOL_NAME, SUMMARIZE_TOOL_NAME } from "@/lib/assistant/tool-definitions";
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

function isDetailInput(input: unknown): input is DetailInput {
  return typeof input === "object" && input !== null && typeof (input as DetailInput).nap_id === "string";
}

/**
 * Runs the tool named `name` against `network`. Never throws: a failure is
 * reported as `{ content, isError: true }` for the caller to wrap into a
 * tool_result.
 */
export function dispatchTool(
  name: string,
  input: unknown,
  network: Network,
): { content: unknown; isError: boolean } {
  try {
    switch (name) {
      case SUMMARIZE_TOOL_NAME: {
        const { min_margin_db } = (input ?? {}) as SummarizeInput;
        return {
          content: summarizeOpticalBudgets(network, { minMarginDb: min_margin_db }),
          isError: false,
        };
      }
      case DETAIL_TOOL_NAME: {
        if (!isDetailInput(input)) {
          return { content: { error: "detail_optical_budget requires a nap_id" }, isError: true };
        }
        return {
          content: detailOpticalBudget(network, input.nap_id, { minMarginDb: input.min_margin_db }),
          isError: false,
        };
      }
      default:
        return { content: { error: `Unknown tool: ${name}` }, isError: true };
    }
  } catch (error) {
    return { content: { error: error instanceof Error ? error.message : String(error) }, isError: true };
  }
}

/** Runs `toolUse` and packages the result as the `tool_result` block the API expects. */
export function runToolUse(
  toolUse: Anthropic.ToolUseBlock,
  network: Network,
): Anthropic.ToolResultBlockParam {
  const { content, isError } = dispatchTool(toolUse.name, toolUse.input, network);
  return {
    type: "tool_result",
    tool_use_id: toolUse.id,
    content: JSON.stringify(content),
    is_error: isError,
  };
}
