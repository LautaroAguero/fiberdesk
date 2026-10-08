import { describe, expect, test } from "vitest";

import { compareRuns } from "@/lib/evals/compare";
import { formatComparison, formatSummary } from "@/lib/evals/report";
import { summarizeRun } from "@/lib/evals/stats";
import type { CaseRecord, RunRecord } from "@/lib/evals/types";

const caseRecord = (id: string, outcome: CaseRecord["outcome"], cost: number): CaseRecord => ({
  id,
  area: "budget",
  outcome,
  graders: outcome === "fail" ? { grounding: { pass: false, reasons: ["ungrounded figure 2.7"] } } : {},
  sign_only: [],
  turns: [
    {
      user: "q",
      answer: "a",
      cited_sources: [],
      stop_reason: "end_turn",
      trajectory: [],
      highlight_ids: [],
      calls: [],
      cost_usd: cost,
      latency_ms: 4000,
    },
  ],
  cost_usd: cost,
});

function record(cases: CaseRecord[]): RunRecord {
  return {
    schema_version: 1,
    started_at: "2026-10-08T10:00:00.000Z",
    finished_at: "2026-10-08T10:05:00.000Z",
    git_commit: null,
    model: "claude-opus-5",
    effort: "low",
    overridden: { model: false, effort: false },
    prompt_hash: "0123456789abcdef".repeat(4),
    max_usd: 10,
    spent_usd: 0.05,
    status: "complete",
    stopped_reason: null,
    unpriced_models: [],
    summary: summarizeRun(cases),
    cases,
  };
}

describe("formatSummary", () => {
  test("renders rates, the interval, cost and latency, and why each case did not pass", () => {
    const text = formatSummary(
      record([caseRecord("a", "pass", 0.02), caseRecord("b", "pass", 0.02), caseRecord("c", "fail", 0.01)]),
    );
    expect(text).toContain("| budget | 2/3 | 66.7% |");
    expect(text).toContain("Cost per question (n=3): median $0.0200, p95 $0.0200");
    expect(text).toContain("Latency per question (n=3): median 4.0 s, p95 4.0 s");
    expect(text).toContain("- c — grounding: ungrounded figure 2.7");
  });
});

describe("formatComparison", () => {
  test("names the flips", () => {
    const text = formatComparison(
      compareRuns(record([caseRecord("x", "pass", 0.01)]), record([caseRecord("x", "fail", 0.01)])),
    );
    expect(text).toContain("pass → fail: 1 (x)");
    expect(text).toContain("Unstable: x");
  });
});
