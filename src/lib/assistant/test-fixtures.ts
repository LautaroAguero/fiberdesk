/**
 * Test-only helpers: a fully valid, minimal {@link Anthropic.Message} builder
 * and a fake {@link AssistantModelClient} that plays back a fixed sequence of
 * such messages. Every field the SDK's `Message` type requires but the loop
 * never reads is filled in with an inert default here, so call sites only
 * specify what a test actually cares about.
 *
 * Used exclusively by `.test.ts` files — never by production code, and never
 * touches the network. See design.md, decision 8.
 */

import type Anthropic from "@anthropic-ai/sdk";

import type { AssistantModelClient } from "@/lib/assistant/model-client";

/** A fully valid Message, with sane defaults for everything a test does not override. */
export function makeFixtureMessage(
  overrides: Partial<Anthropic.Message> & { content: Anthropic.ContentBlock[] },
): Anthropic.Message {
  return {
    id: "msg_fixture",
    container: null,
    model: "claude-opus-5",
    role: "assistant",
    stop_details: null,
    stop_reason: "end_turn",
    stop_sequence: null,
    type: "message",
    usage: {
      cache_creation: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      inference_geo: null,
      input_tokens: 10,
      output_tokens: 10,
      output_tokens_details: null,
      server_tool_use: null,
      service_tier: null,
    },
    ...overrides,
  };
}

/** A text content block, for building fixture message content arrays tersely. */
export function textBlock(text: string): Anthropic.TextBlock {
  return { type: "text", text, citations: null };
}

/** A tool_use content block. */
export function toolUseBlock(id: string, name: string, input: unknown): Anthropic.ToolUseBlock {
  return { type: "tool_use", id, name, input, caller: { type: "direct" } };
}

/** One scripted turn: text deltas to fire before resolving, then the final message. */
export interface FixtureTurn {
  textDeltas?: string[];
  message: Anthropic.Message;
}

/**
 * A fake {@link AssistantModelClient} that plays back `turns` in order and
 * records every request it received, for assertions on what the loop sent.
 */
export function createFakeModelClient(turns: FixtureTurn[]): {
  client: AssistantModelClient;
  requests: Anthropic.MessageStreamParams[];
} {
  const requests: Anthropic.MessageStreamParams[] = [];
  let index = 0;

  const client: AssistantModelClient = {
    createTurn(params) {
      // Snapshot `messages` now: the loop mutates its own array by pushing
      // further turns onto it after this call returns, and a real request
      // would already have serialized its body before that happens.
      requests.push({ ...params, messages: [...params.messages] });
      const turn = turns[index++];
      if (!turn) {
        throw new Error(`createFakeModelClient: no fixture turn left for request #${index}`);
      }

      const textCallbacks: Array<(delta: string) => void> = [];
      return {
        onText(callback) {
          textCallbacks.push(callback);
        },
        async finalMessage() {
          for (const delta of turn.textDeltas ?? []) {
            for (const callback of textCallbacks) callback(delta);
          }
          return turn.message;
        },
      };
    },
  };

  return { client, requests };
}
