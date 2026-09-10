/**
 * The seam between the assistant loop and the Anthropic SDK.
 *
 * `loop.ts` depends only on {@link AssistantModelClient} — a minimal interface
 * covering exactly what the loop needs from a streamed turn. Tests supply a
 * fake implementation and never touch the network; {@link createModelClient}
 * is the real one, a thin wrapper over `client.messages.stream(...)` that is
 * not itself unit-tested, by design (see design.md, decision 8).
 */

import Anthropic from "@anthropic-ai/sdk";

import { getAnthropicApiKey } from "@/lib/assistant/env";

/** One streamed turn: prose deltas as they arrive, then the completed message. */
export interface ModelTurn {
  /** Registers a callback invoked with each incremental text fragment. */
  onText(callback: (delta: string) => void): void;
  /** Resolves once the turn is complete, with the full assembled message. */
  finalMessage(): Promise<Anthropic.Message>;
}

/** What the assistant loop needs from a model client. Nothing more. */
export interface AssistantModelClient {
  createTurn(params: Anthropic.MessageStreamParams): ModelTurn;
}

/** Constructs the real client, reading the API key from the environment. */
export function createAnthropicClient(): Anthropic {
  return new Anthropic({ apiKey: getAnthropicApiKey() });
}

/** Wraps a real {@link Anthropic} client as an {@link AssistantModelClient}. */
export function createModelClient(client: Anthropic): AssistantModelClient {
  return {
    createTurn(params) {
      const stream = client.messages.stream(params);
      return {
        onText(callback) {
          stream.on("text", callback);
        },
        finalMessage() {
          return stream.finalMessage();
        },
      };
    },
  };
}
