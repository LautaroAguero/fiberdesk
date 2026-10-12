import { describe, expect, test } from "vitest";

import { readFileSync } from "node:fs";
import path from "node:path";

import type { ModelCallRecord } from "@/lib/assistant/usage";
import { coldCost, median, p95, summarizeRun, wilsonInterval } from "@/lib/evals/stats";
import type { CaseRecord, RunRecord, TurnRecord } from "@/lib/evals/types";

const pct = (x: number) => Math.round(x * 1000) / 10;

describe("wilsonInterval", () => {
  test("17 of 20 → 64.0%–94.8%", () => {
    const { low, high } = wilsonInterval(17, 20);
    expect([pct(low), pct(high)]).toEqual([64.0, 94.8]);
  });

  test("68 of 80 → 75.6%–91.2%", () => {
    const { low, high } = wilsonInterval(68, 80);
    expect([pct(low), pct(high)]).toEqual([75.6, 91.2]);
  });

  test("0 of 5 and 5 of 5 stay within [0, 1]", () => {
    const none = wilsonInterval(0, 5);
    const all = wilsonInterval(5, 5);
    expect(none.low).toBe(0);
    expect(none.high).toBeLessThan(1);
    expect(all.high).toBe(1);
    expect(all.low).toBeGreaterThan(0);
  });

  test("n of zero is refused", () => {
    expect(() => wilsonInterval(0, 0)).toThrow();
  });
});

describe("median and p95", () => {
  const costs = Array.from({ length: 20 }, (_, i) => (i + 1) / 100); // 0.01 … 0.20

  test("costs 0.01…0.20: median 0.105, p95 0.19 (19th of 20)", () => {
    expect(median(costs)).toBeCloseTo(0.105, 12);
    expect(p95(costs)).toBe(0.19);
  });

  test("order of input does not matter", () => {
    expect(median([...costs].reverse())).toBeCloseTo(0.105, 12);
  });

  test("a single value is its own median and p95", () => {
    expect(median([7])).toBe(7);
    expect(p95([7])).toBe(7);
  });

  test("an empty sample throws", () => {
    expect(() => median([])).toThrow();
    expect(() => p95([])).toThrow();
  });
});

describe("summarizeRun", () => {
  const turnRecord = (cost: number | null, latency: number): TurnRecord => ({
    user: "q",
    answer: "a",
    cited_sources: [],
    stop_reason: "end_turn",
    trajectory: [],
    highlight_ids: [],
    calls: [],
    cost_usd: cost,
    latency_ms: latency,
  });
  const caseRecord = (id: string, area: CaseRecord["area"], outcome: CaseRecord["outcome"], turns: TurnRecord[]): CaseRecord => ({
    id,
    area,
    outcome,
    graders: {},
    sign_only: [],
    turns,
    cost_usd: null,
  });

  test("rates are over completed cases; errors and skips are counted beside them", () => {
    const summary = summarizeRun([
      caseRecord("a", "budget", "pass", [turnRecord(0.02, 1000)]),
      caseRecord("b", "budget", "fail", [turnRecord(0.04, 3000)]),
      caseRecord("c", "budget", "error", [turnRecord(0.5, 9000)]),
      caseRecord("d", "docs", "pass", [turnRecord(0.01, 2000), turnRecord(0.03, 4000)]),
      caseRecord("e", "docs", "skipped_budget", []),
    ]);

    expect(summary.overall).toMatchObject({ passes: 2, completed: 3, errors: 1, skipped: 1 });
    expect(summary.overall.rate).toBeCloseTo(2 / 3, 12);
    expect(summary.by_area.budget).toMatchObject({ passes: 1, completed: 2, errors: 1 });
    expect(summary.by_area.docs).toMatchObject({ passes: 1, completed: 1, skipped: 1 });
    // Four questions from completed cases: the errored case's turn is excluded.
    expect(summary.cost_per_question).toEqual({ n: 4, median: 0.025, p95: 0.04 });
    expect(summary.latency_ms_per_question).toEqual({ n: 4, median: 2500, p95: 4000 });
  });

  test("an area with nothing completed has no rate", () => {
    const summary = summarizeRun([caseRecord("e", "docs", "skipped_budget", [])]);
    expect(summary.by_area.docs).toMatchObject({ rate: null, low: null, high: null });
    expect(summary.cost_per_question).toEqual({ n: 0, median: null, p95: null });
    expect(summary.cold_cost_per_question).toEqual({ n: 0, median: null, p95: null });
  });
});

describe("coldCost (reduce-cost-per-question, task 3.2)", () => {
  const call = (model: string, over: Partial<ModelCallRecord> = {}): ModelCallRecord => ({
    model,
    input_tokens: 100,
    output_tokens: 100,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    latency_ms: 1000,
    cost_usd: 0.001,
    stop_reason: "end_turn",
    ...over,
  });
  const turn = (cost: number | null, calls: ModelCallRecord[]): Pick<TurnRecord, "cost_usd" | "calls"> => ({
    cost_usd: cost,
    calls,
  });

  test("re-prices the first call's reads: $0.0100 and 2,400 reads on Sonnet 5.5 gives $0.01552", () => {
    const cold = coldCost(turn(0.01, [call("claude-sonnet-5-5", { cache_read_input_tokens: 2400 })]));
    expect(cold).toBeCloseTo(0.01552, 12);
  });

  test("without cache activity, cold equals measured", () => {
    const calls = [call("claude-opus-5"), call("claude-opus-5")];
    expect(coldCost(turn(0.0376, calls))).toBe(0.0376);
  });

  test("a second call's 3,000 reads stay at the read rate", () => {
    const calls = [
      call("claude-sonnet-5-5", { cache_creation_input_tokens: 2400 }),
      call("claude-sonnet-5-5", { cache_read_input_tokens: 3000 }),
    ];
    expect(coldCost(turn(0.01, calls))).toBe(0.01);
  });

  test("only the first call is re-priced when both read", () => {
    const calls = [
      call("claude-sonnet-5-5", { cache_read_input_tokens: 2400 }),
      call("claude-sonnet-5-5", { cache_read_input_tokens: 3000 }),
    ];
    expect(coldCost(turn(0.01, calls))).toBeCloseTo(0.01552, 12);
  });

  test("an unpriced model gives null, never an estimate", () => {
    const calls = [
      call("claude-sonnet-5-5", { cache_read_input_tokens: 2400 }),
      call("claude-unpriced-test", { cost_usd: null }),
    ];
    expect(coldCost(turn(null, calls))).toBeNull();
    // Even a stated cost does not rescue a call whose model has no listed rates.
    expect(coldCost(turn(0.01, [call("claude-unpriced-test", { cost_usd: 0.01 })]))).toBeNull();
  });

  test("a table passed by the caller is the one used for the re-pricing", () => {
    const prices = { m: { input: 1, output: 1, cache_write_5m: 2, cache_read: 0.5 } };
    expect(coldCost(turn(1, [call("m", { cache_read_input_tokens: 1_000_000 })]), prices)).toBeCloseTo(2.5, 12);
  });

  test("summarizeRun leaves a question with an unknown cold cost out of the distribution", () => {
    const base = { user: "q", answer: "a", cited_sources: [], stop_reason: "end_turn", trajectory: [], highlight_ids: [], latency_ms: 1 };
    const priced: TurnRecord = { ...base, ...turn(0.01, [call("claude-opus-5")]) };
    const unpriced: TurnRecord = { ...base, ...turn(null, [call("claude-unpriced-test", { cost_usd: null })]) };
    const summary = summarizeRun([
      { id: "a", area: "budget", outcome: "pass", graders: {}, sign_only: [], turns: [priced, unpriced], cost_usd: null },
    ]);
    expect(summary.cold_cost_per_question).toEqual({ n: 1, median: 0.01, p95: 0.01 });
  });

  test("over the baseline record, which had no caching, the cold median equals the measured $0.037605", () => {
    const baseline = JSON.parse(
      readFileSync(path.join(process.cwd(), "evals", "runs", "2026-10-08T03-32-06Z.regraded.json"), "utf8"),
    ) as RunRecord;
    const summary = summarizeRun(baseline.cases);
    expect(summary.cost_per_question.n).toBe(24);
    expect(summary.cold_cost_per_question.n).toBe(24);
    expect(summary.cold_cost_per_question.median).toBe(summary.cost_per_question.median);
    expect(summary.cold_cost_per_question.median).toBeCloseTo(0.037605, 6);
  });
});
