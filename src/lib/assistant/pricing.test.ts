import { describe, expect, test } from "vitest";

import { computeCost, MODEL_PRICES, PRICES_VERIFIED_ON } from "@/lib/assistant/pricing";

const usage = (counts: {
  input?: number;
  output?: number;
  cacheWrite?: number | null;
  cacheRead?: number | null;
}) => ({
  input_tokens: counts.input ?? 0,
  output_tokens: counts.output ?? 0,
  cache_creation_input_tokens: counts.cacheWrite ?? null,
  cache_read_input_tokens: counts.cacheRead ?? null,
});

describe("computeCost", () => {
  test("Opus 5, 2,000 in / 500 out, no cache → $0.0225", () => {
    expect(computeCost("claude-opus-5", usage({ input: 2000, output: 500 }))).toBeCloseTo(0.0225, 12);
  });

  test("Opus 5, 1,000 in / 3,000 cache-read / 200 out → $0.0115", () => {
    expect(
      computeCost("claude-opus-5", usage({ input: 1000, cacheRead: 3000, output: 200 })),
    ).toBeCloseTo(0.0115, 12);
  });

  test("cache-write tokens are priced at the 5-minute write rate, $6.25 on Opus 5", () => {
    expect(computeCost("claude-opus-5", usage({ cacheWrite: 1_000_000 }))).toBeCloseTo(6.25, 12);
  });

  test("null cache fields count as zero", () => {
    expect(
      computeCost("claude-opus-5", usage({ input: 1_000_000, cacheWrite: null, cacheRead: null })),
    ).toBeCloseTo(5, 12);
  });

  test("a model the table does not list costs null, not a guess", () => {
    expect(computeCost("claude-haiku-4-5", usage({ input: 1000, output: 1000 }))).toBeNull();
  });

  test("Opus 5.5's cache read is its own stated rate, not 0.1 × input", () => {
    expect(MODEL_PRICES["claude-opus-5-5"].cache_read).toBe(0.2);
    expect(MODEL_PRICES["claude-opus-5-5"].input * 0.1).not.toBe(0.2);
  });

  test("the verification date is recorded", () => {
    expect(PRICES_VERIFIED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
