/**
 * Per-call usage metering, and the per-turn summary built from it.
 *
 * Metering wraps the {@link AssistantModelClient} seam rather than living in
 * the loop, so a turn that throws part-way still reports what its completed
 * calls spent: each record is emitted the moment its own call finishes. See
 * design.md (add-eval-harness), decision 3.
 *
 * Every figure here is read from `message.usage` or computed by
 * `computeCost` — never produced by the model.
 */

import type { ToolCallRecord } from "@/lib/assistant/loop";
import type { AssistantModelClient } from "@/lib/assistant/model-client";
import { computeCost } from "@/lib/assistant/pricing";

/** What one model call consumed. */
export interface ModelCallRecord {
  /** The model that served the call, as the response reports it — not the one requested. */
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  /** From the request to the completed message, in milliseconds. */
  latency_ms: number;
  /** US dollars; `null` when the serving model is not in the pricing table. */
  cost_usd: number | null;
  stop_reason: string | null;
}

/** One tool call in a turn's trajectory, without its input or result. */
export interface TrajectoryStep {
  name: string;
  iteration: number;
  is_error: boolean;
}

/** A turn's calls added up. */
export interface TurnUsageSummary {
  iterations: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  latency_ms: number;
  /** `null` when any call's cost is unknown — a partial sum would understate the spend. */
  cost_usd: number | null;
  /** Serving models absent from the pricing table, if any. */
  unpriced_models: string[];
  trajectory: TrajectoryStep[];
}

/**
 * Wraps `client` so that every completed call is reported to `onCall`.
 * `clock` returns milliseconds; injectable so tests can fix latencies.
 */
export function withUsageMetering(
  client: AssistantModelClient,
  onCall: (record: ModelCallRecord) => void,
  clock: () => number = () => performance.now(),
): AssistantModelClient {
  return {
    createTurn(params) {
      const startedAt = clock();
      const turn = client.createTurn(params);
      return {
        onText(callback) {
          turn.onText(callback);
        },
        async finalMessage() {
          const message = await turn.finalMessage();
          const usage = {
            input_tokens: message.usage.input_tokens ?? 0,
            output_tokens: message.usage.output_tokens ?? 0,
            cache_creation_input_tokens: message.usage.cache_creation_input_tokens ?? 0,
            cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0,
          };
          onCall({
            model: message.model,
            ...usage,
            latency_ms: clock() - startedAt,
            cost_usd: computeCost(message.model, usage),
            stop_reason: message.stop_reason,
          });
          return message;
        },
      };
    },
  };
}

/** Sums a turn's calls and lists its tool trajectory in call order. */
export function summarizeTurn(calls: ModelCallRecord[], toolCalls: ToolCallRecord[]): TurnUsageSummary {
  const sum = (pick: (call: ModelCallRecord) => number) =>
    calls.reduce((total, call) => total + pick(call), 0);

  const unpricedModels = [
    ...new Set(calls.filter((call) => call.cost_usd === null).map((call) => call.model)),
  ];

  return {
    iterations: calls.length,
    input_tokens: sum((call) => call.input_tokens),
    output_tokens: sum((call) => call.output_tokens),
    cache_creation_input_tokens: sum((call) => call.cache_creation_input_tokens),
    cache_read_input_tokens: sum((call) => call.cache_read_input_tokens),
    latency_ms: sum((call) => call.latency_ms),
    cost_usd: unpricedModels.length > 0 ? null : sum((call) => call.cost_usd ?? 0),
    unpriced_models: unpricedModels,
    trajectory: toolCalls.map((call) => ({
      name: call.name,
      iteration: call.iteration,
      is_error: call.isError,
    })),
  };
}
