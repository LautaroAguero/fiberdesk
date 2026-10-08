/**
 * Model prices, and the cost of one model call computed from them.
 *
 * The same discipline as the optical constants: every rate lives here, with
 * its unit, the date it was verified and where it came from. Cost is always
 * computed by `computeCost`, never stated by the model. See design.md
 * (add-eval-harness), decision 4.
 *
 * Rates are explicit per model rather than one multiplier applied to the
 * input price, because the source already shows they differ: Opus 5.5's
 * cache read is 0.05 × input, not the 0.1 × that holds for the others. A rate
 * the source does not state directly is marked DERIVED, with the rule that
 * produced it, so it can be checked and replaced.
 */

import type Anthropic from "@anthropic-ai/sdk";

/** When the rates below were last checked against their source. */
export const PRICES_VERIFIED_ON = "2026-10-08";

/** Where the rates below came from. */
export const PRICES_SOURCE =
  "claude-api skill, 'Current Models' table and per-model notes (cached 2026-10-06)";

/** All rates in US dollars per million tokens. */
export interface ModelPrice {
  /** Uncached input tokens. */
  input: number;
  /** Output tokens, thinking included. */
  output: number;
  /** Tokens written to the prompt cache with the default 5-minute TTL. */
  cache_write_5m: number;
  /** Tokens read from the prompt cache. */
  cache_read: number;
}

export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  "claude-opus-5": {
    input: 5.0, // USD/MTok — stated
    output: 25.0, // USD/MTok — stated
    cache_write_5m: 6.25, // USD/MTok — DERIVED: 1.25 × input (5-minute cache write rule)
    cache_read: 0.5, // USD/MTok — DERIVED: 0.1 × input (cache read rule)
  },
  "claude-opus-5-5": {
    input: 4.0, // USD/MTok — stated
    output: 20.0, // USD/MTok — stated
    cache_write_5m: 5.0, // USD/MTok — DERIVED: 1.25 × input (5-minute cache write rule)
    cache_read: 0.2, // USD/MTok — stated ("cache reads $0.20")
  },
  "claude-sonnet-5-5": {
    input: 2.0, // USD/MTok — stated
    output: 10.0, // USD/MTok — stated
    cache_write_5m: 2.5, // USD/MTok — DERIVED: 1.25 × input (5-minute cache write rule)
    cache_read: 0.2, // USD/MTok — stated ("cache reads $0.20")
  },
};

/** The token counts a call reported, as the API names them. Missing or null counts are zero. */
export type UsageCounts = Pick<
  Anthropic.Usage,
  "input_tokens" | "output_tokens" | "cache_creation_input_tokens" | "cache_read_input_tokens"
>;

const PER_MILLION = 1_000_000;

/**
 * The cost of one call in US dollars, or `null` when `model` is not in the
 * table. Never guesses a rate for an unknown model.
 *
 * `input_tokens` excludes cached tokens — the API reports cache reads and
 * writes in their own fields — so the four terms do not overlap.
 */
export function computeCost(model: string, usage: UsageCounts): number | null {
  const price = MODEL_PRICES[model];
  if (!price) return null;

  return (
    ((usage.input_tokens ?? 0) * price.input +
      (usage.output_tokens ?? 0) * price.output +
      (usage.cache_creation_input_tokens ?? 0) * price.cache_write_5m +
      (usage.cache_read_input_tokens ?? 0) * price.cache_read) /
    PER_MILLION
  );
}
