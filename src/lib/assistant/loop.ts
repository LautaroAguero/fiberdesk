/**
 * The manual tool-use loop.
 *
 * Written out rather than delegated to the SDK's tool runner — see design.md,
 * decision 4 — because the caller needs every tool result retained (to build
 * the map payload later) and because the loop must guarantee that when one
 * assistant turn holds several `tool_use` blocks, **all** their results go
 * back in a single user message. Splitting them across messages is the kind
 * of mistake that degrades the model's willingness to make parallel calls,
 * silently and without error.
 *
 * Depends only on {@link AssistantModelClient} (not `Anthropic` directly), so
 * every test here runs against a fake client — never the API. See design.md,
 * decision 8.
 */

import type Anthropic from "@anthropic-ai/sdk";

import { runToolUse } from "@/lib/assistant/dispatcher";
import type { AssistantEvent } from "@/lib/assistant/events";
import type { AssistantModelClient } from "@/lib/assistant/model-client";
import type { Network } from "@/lib/network/types";

/** One tool call this turn made, kept for the highlight projection that follows the loop. */
export interface ToolCallRecord {
  name: string;
  input: unknown;
  /** Parsed adapter output. `null` when `isError` is true. */
  result: unknown;
  isError: boolean;
}

export interface RunAssistantLoopParams {
  client: AssistantModelClient;
  model: string;
  maxTokens: number;
  system?: string;
  tools: Anthropic.Tool[];
  /** Prior turns plus the new user message, oldest first. */
  messages: Anthropic.MessageParam[];
  network: Network;
  onEvent: (event: AssistantEvent) => void;
  /** Reasoning depth. See design.md, decision 7 — low/medium serve this domain. */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /** Caps how many request/tool-execute round trips one turn may take. */
  maxIterations?: number;
}

export interface RunAssistantLoopResult {
  /** The full conversation, including every assistant and tool-result turn appended. */
  messages: Anthropic.MessageParam[];
  /** Every tool call made across every iteration of this turn, in call order. */
  toolCalls: ToolCallRecord[];
  stopReason: Anthropic.Message["stop_reason"] | null;
  /** True if the loop stopped because it hit `maxIterations`, not because the model finished. */
  truncated: boolean;
}

const DEFAULT_MAX_ITERATIONS = 8;

export async function runAssistantLoop(
  params: RunAssistantLoopParams,
): Promise<RunAssistantLoopResult> {
  const { client, model, maxTokens, system, tools, network, onEvent, effort } = params;
  const maxIterations = params.maxIterations ?? DEFAULT_MAX_ITERATIONS;

  const messages: Anthropic.MessageParam[] = [...params.messages];
  const toolCalls: ToolCallRecord[] = [];

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const turn = client.createTurn({
      model,
      max_tokens: maxTokens,
      system,
      tools,
      messages,
      thinking: { type: "adaptive", display: "summarized" },
      ...(effort ? { output_config: { effort } } : {}),
    });

    turn.onText((delta) => onEvent({ type: "text", text: delta }));

    const message = await turn.finalMessage();
    messages.push({ role: "assistant", content: message.content });

    if (message.stop_reason !== "tool_use") {
      return { messages, toolCalls, stopReason: message.stop_reason, truncated: false };
    }

    const toolUseBlocks = message.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    // All results for this turn are collected here and pushed as ONE user
    // message below — never split across messages. See the module doc.
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      onEvent({ type: "tool_start", tool_use_id: block.id, name: block.name, input: block.input });

      const resultBlock = runToolUse(block, network);
      toolResults.push(resultBlock);
      toolCalls.push({
        name: block.name,
        input: block.input,
        result: resultBlock.is_error ? null : JSON.parse(resultBlock.content as string),
        isError: Boolean(resultBlock.is_error),
      });

      onEvent({
        type: "tool_end",
        tool_use_id: block.id,
        name: block.name,
        is_error: Boolean(resultBlock.is_error),
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  onEvent({
    type: "error",
    message: `Stopped after ${maxIterations} tool-use round trips without finishing.`,
  });
  return { messages, toolCalls, stopReason: null, truncated: true };
}
