import { describe, expect, test } from "vitest";

import { compareRuns } from "@/lib/evals/compare";
import { summarizeRun } from "@/lib/evals/stats";
import type { CaseOutcome, CaseRecord, RunRecord } from "@/lib/evals/types";

function run(outcomes: Record<string, CaseOutcome>): RunRecord {
  const cases: CaseRecord[] = Object.entries(outcomes).map(([id, outcome]) => ({
    id,
    area: "budget",
    outcome,
    graders: {},
    sign_only: [],
    turns: [],
    cost_usd: null,
  }));
  return {
    schema_version: 1,
    started_at: "2026-10-08T00:00:00.000Z",
    finished_at: "2026-10-08T00:10:00.000Z",
    git_commit: null,
    model: "claude-opus-5",
    effort: "low",
    overridden: { model: false, effort: false },
    prompt_hash: "x",
    max_usd: 10,
    spent_usd: 0,
    status: "complete",
    stopped_reason: null,
    unpriced_models: [],
    summary: summarizeRun(cases),
    cases,
  };
}

describe("compareRuns", () => {
  test("one flip each way is reported 1 / 1, both named unstable", () => {
    const comparison = compareRuns(
      run({ "budget-limit-es": "pass", "docs-rain-es": "fail", "budget-failing-es": "pass" }),
      run({ "budget-limit-es": "fail", "docs-rain-es": "pass", "budget-failing-es": "pass" }),
    );
    expect(comparison.compared).toBe(3);
    expect(comparison.pass_to_fail).toEqual(["budget-limit-es"]);
    expect(comparison.fail_to_pass).toEqual(["docs-rain-es"]);
    expect(comparison.unstable).toEqual(["budget-limit-es", "docs-rain-es"]);
  });

  test("errored, skipped and one-sided cases are listed apart and excluded from the counts", () => {
    const comparison = compareRuns(
      run({ a: "error", b: "pass", c: "pass", d: "skipped_budget" }),
      run({ a: "fail", b: "pass", d: "fail", e: "pass" }),
    );
    expect(comparison.compared).toBe(1);
    expect(comparison.unstable).toEqual([]);
    expect(comparison.excluded).toEqual([
      { id: "a", a: "error", b: "fail" },
      { id: "d", a: "skipped_budget", b: "fail" },
    ]);
    expect(comparison.only_in_a).toEqual(["c"]);
    expect(comparison.only_in_b).toEqual(["e"]);
  });
});
