/**
 * The statistics a run reports: pass rates with a 95% Wilson interval, and
 * the median and 95th percentile of cost and latency per question. All of it
 * computed here, deterministically — no figure in a summary comes from a
 * model. See design.md (add-eval-harness), decision 12.
 */

import type { CaseRecord, RateSummary, RunSummary } from "@/lib/evals/types";

/** The z-score for a two-sided 95% interval. */
const Z_95 = 1.96;

/**
 * The 95% Wilson score interval for `passes` out of `n`, as fractions.
 * Preferred over the normal approximation, which leaves [0, 1] and is badly
 * calibrated at n ≈ 20 with rates near the top of the range.
 */
export function wilsonInterval(passes: number, n: number, z: number = Z_95): { low: number; high: number } {
  if (n <= 0) throw new Error("wilsonInterval: n must be positive");
  if (passes < 0 || passes > n) throw new Error("wilsonInterval: passes must be within [0, n]");
  const p = passes / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denominator;
  const halfWidth = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator;
  return { low: Math.max(0, centre - halfWidth), high: Math.min(1, centre + halfWidth) };
}

function sorted(values: number[]): number[] {
  if (values.length === 0) throw new Error("cannot summarize an empty sample");
  return [...values].sort((a, b) => a - b);
}

/** The middle value, or the mean of the two middle values for an even count. */
export function median(values: number[]): number {
  const s = sorted(values);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * The 95th percentile by nearest rank: the `ceil(0.95 · n)`-th sorted value.
 * No interpolation — with n ≈ 20 an interpolated value would sit between
 * observations that never happened.
 */
export function p95(values: number[]): number {
  const s = sorted(values);
  return s[Math.ceil(0.95 * s.length) - 1];
}

function rate(cases: CaseRecord[]): RateSummary {
  const passes = cases.filter((c) => c.outcome === "pass").length;
  const completed = cases.filter((c) => c.outcome === "pass" || c.outcome === "fail").length;
  const interval = completed > 0 ? wilsonInterval(passes, completed) : null;
  return {
    passes,
    completed,
    errors: cases.filter((c) => c.outcome === "error").length,
    skipped: cases.filter((c) => c.outcome === "skipped_budget").length,
    rate: completed > 0 ? passes / completed : null,
    low: interval?.low ?? null,
    high: interval?.high ?? null,
  };
}

function distribution(values: number[]) {
  return values.length === 0
    ? { n: 0, median: null, p95: null }
    : { n: values.length, median: median(values), p95: p95(values) };
}

/**
 * The run's summary. Pass rates are over completed cases (pass or fail);
 * errors and skips are counted beside them. Cost and latency are per
 * question — per user turn — over completed cases only.
 */
export function summarizeRun(cases: CaseRecord[]): RunSummary {
  const byArea: Record<string, RateSummary> = {};
  for (const area of [...new Set(cases.map((c) => c.area))]) {
    byArea[area] = rate(cases.filter((c) => c.area === area));
  }

  const turns = cases
    .filter((c) => c.outcome === "pass" || c.outcome === "fail")
    .flatMap((c) => c.turns);

  return {
    overall: rate(cases),
    by_area: byArea,
    cost_per_question: distribution(
      turns.map((t) => t.cost_usd).filter((cost): cost is number => cost !== null),
    ),
    latency_ms_per_question: distribution(turns.map((t) => t.latency_ms)),
  };
}
