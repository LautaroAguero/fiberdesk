import { describe, expect, test } from "vitest";

import { decide, type DecideResult } from "@/lib/evals/decide";
import { summarizeRun } from "@/lib/evals/stats";
import type { Area, CaseOutcome, CaseRecord, GraderName, GraderResult, RunRecord, RunStatus } from "@/lib/evals/types";

/** 18 cases across the four areas, in a fixed order. */
const FIXTURE: Array<[id: string, area: Area]> = [
  ["budget-detail-nap07", "budget"],
  ["budget-limit-es", "budget"],
  ["budget-failing-es", "budget"],
  ["budget-margin-es", "budget"],
  ["budget-nap01-es", "budget"],
  ["docs-rain-es", "docs"],
  ["docs-cascade-en", "docs"],
  ["docs-fiber-en", "docs"],
  ["docs-connector-es", "docs"],
  ["docs-x1", "docs"],
  ["docs-x2", "docs"],
  ["docs-x3", "docs"],
  ["docs-x4", "docs"],
  ["abstain-ont-en", "abstention"],
  ["abstain-ont-es", "abstention"],
  ["abstain-vendor-es", "abstention"],
  ["conv-a", "conversation"],
  ["conv-b", "conversation"],
];

interface RunSpec {
  /** Ids that fail; every other case passes. */
  fail?: string[];
  /** Per case, graders that fail (the case then fails too). Graders not listed pass or are absent. */
  failGraders?: Record<string, GraderName[]>;
  /** Per case, graders that pass and are present on the record. */
  passGraders?: Record<string, GraderName[]>;
  model?: string;
  effort?: string;
  promptHash?: string;
  status?: RunStatus;
  caching?: boolean;
  /** Measured cost of every question, in dollars. */
  cost?: number;
  /** Cache-read tokens on the first call of the first case. */
  cacheRead?: number;
  extraCases?: CaseRecord[];
  /** Replace the outcome of a case with a non-completed one. */
  outcomes?: Record<string, CaseOutcome>;
}

const result = (pass: boolean): GraderResult => ({ pass, reasons: pass ? [] : ["it failed"] });

function run(spec: RunSpec = {}): RunRecord {
  const model = spec.model ?? "claude-opus-5";
  const cost = spec.cost ?? 0.0376;
  const cases: CaseRecord[] = FIXTURE.map(([id, area], index) => {
    const graderFailures = spec.failGraders?.[id] ?? [];
    const failed = (spec.fail ?? []).includes(id) || graderFailures.length > 0;
    const graders: CaseRecord["graders"] = {};
    for (const name of spec.passGraders?.[id] ?? []) graders[name] = result(true);
    for (const name of graderFailures) graders[name] = result(false);
    return {
      id,
      area,
      outcome: spec.outcomes?.[id] ?? (failed ? "fail" : "pass"),
      graders,
      sign_only: [],
      turns: [
        {
          user: "q",
          answer: "a",
          cited_sources: [],
          stop_reason: "end_turn",
          trajectory: [],
          highlight_ids: [],
          calls: [
            {
              model,
              input_tokens: 1000,
              output_tokens: 100,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: index === 0 ? (spec.cacheRead ?? 0) : 0,
              latency_ms: 1000,
              cost_usd: cost,
              stop_reason: "end_turn",
            },
          ],
          cost_usd: cost,
          latency_ms: 1000,
        },
      ],
      cost_usd: cost,
    };
  });
  const all = [...cases, ...(spec.extraCases ?? [])];
  return {
    schema_version: 1,
    started_at: "2026-10-12T10:00:00.000Z",
    finished_at: "2026-10-12T10:05:00.000Z",
    git_commit: null,
    model,
    effort: spec.effort ?? "low",
    overridden: { model: false, effort: false },
    prompt_caching: spec.caching ?? false,
    prompt_hash: spec.promptHash ?? "hash-a",
    max_usd: 2,
    spent_usd: 1,
    status: spec.status ?? "complete",
    stopped_reason: null,
    unpriced_models: [],
    summary: summarizeRun(all),
    cases: all,
  };
}

/** A candidate on Sonnet that costs well under half of the baseline, with nothing else to flag. */
const cheap = (spec: RunSpec = {}) => run({ model: "claude-sonnet-5-5", cost: 0.015, ...spec });

const decideWith = (
  candidate: RunRecord,
  baseline: RunRecord = run(),
  replicate: RunRecord = run(),
): DecideResult => decide({ baseline, replicate, candidate });

const check = (r: DecideResult, name: string) => r.checks.find((c) => c.name === name)!;

describe("the veto", () => {
  test("a stable grounding regression rejects, naming the case and the grader", () => {
    // Grounding on budget-detail-nap07 passes in both baseline runs and fails in the candidate.
    const grounded = { "budget-detail-nap07": ["grounding" as const] };
    const baseline = run({ fail: ["conv-a", "conv-b"], passGraders: grounded });
    const replicate = run({ fail: ["conv-a", "conv-b"], passGraders: grounded });
    const candidate = cheap({ fail: ["conv-a"], failGraders: grounded });

    const verdict = decideWith(candidate, baseline, replicate);

    expect(verdict.passes).toEqual({ baseline: 16, replicate: 16, candidate: 16 });
    expect(verdict.verdict).toBe("reject");
    expect(check(verdict, "veto").pass).toBe(false);
    expect(verdict.reasons.join("\n")).toMatch(/grounding grader is stable on budget-detail-nap07/);
  });

  test("the veto holds even when the candidate passes more cases than the baselines (17 against 15)", () => {
    const grounded = { "budget-detail-nap07": ["grounding" as const] };
    const baseline = run({ fail: ["conv-a", "conv-b", "docs-x1"], passGraders: grounded });
    const replicate = run({ fail: ["conv-a", "conv-b", "docs-x1"], passGraders: grounded });
    const candidate = cheap({ failGraders: grounded });

    const verdict = decideWith(candidate, baseline, replicate);

    expect(verdict.passes!.candidate).toBeGreaterThan(verdict.passes!.baseline);
    expect(verdict.verdict).toBe("reject");
    expect(verdict.reasons.join("\n")).toContain("budget-detail-nap07");
  });

  test("an abstention regression on a stable case vetoes the same way", () => {
    const abstains = { "abstain-ont-en": ["abstention" as const] };
    const candidate = cheap({ failGraders: abstains });

    const verdict = decideWith(candidate, run({ passGraders: abstains }), run({ passGraders: abstains }));

    expect(verdict.verdict).toBe("reject");
    expect(check(verdict, "veto").pass).toBe(false);
    expect(verdict.reasons.join("\n")).toMatch(/abstention grader is stable on abstain-ont-en/);
  });

  test("an unstable grader does not veto, but its case is still listed for reading", () => {
    const docsRain = ["grounding" as const];
    const baseline = run({ passGraders: { "docs-rain-es": docsRain } });
    const replicate = run({ fail: ["docs-rain-es"], failGraders: { "docs-rain-es": docsRain } });
    const candidate = cheap({ fail: ["docs-rain-es"], failGraders: { "docs-rain-es": docsRain } });

    const verdict = decideWith(candidate, baseline, replicate);

    expect(check(verdict, "veto").pass).toBe(true);
    expect(verdict.toRead.map((c) => c.id)).toContain("docs-rain-es");
  });
});

describe("net loss", () => {
  // The baselines pass 16 and 15 cases.
  const baseline = run({ fail: ["conv-a", "conv-b"] });
  const replicate = run({ fail: ["conv-a", "conv-b", "docs-x1"] });

  test("losing one case against the lower baseline is tolerated: 14 against (16, 15)", () => {
    // Four failures, in no vetoed grader and at most one stable case per area.
    const candidate = cheap({ fail: ["conv-a", "conv-b", "docs-x1", "budget-limit-es"] });
    const verdict = decideWith(candidate, baseline, replicate);

    expect(verdict.passes).toEqual({ baseline: 16, replicate: 15, candidate: 14 });
    expect(check(verdict, "net_loss").pass).toBe(true);
  });

  test("losing two is not: 13 against (16, 15) is rejected", () => {
    const candidate = cheap({ fail: ["conv-a", "conv-b", "docs-x1", "budget-limit-es", "docs-rain-es"] });
    const verdict = decideWith(candidate, baseline, replicate);

    expect(verdict.passes!.candidate).toBe(13);
    expect(verdict.verdict).toBe("reject");
    expect(check(verdict, "net_loss").pass).toBe(false);
    // One stable failure in each of two areas is not a concentrated loss.
    expect(check(verdict, "concentrated_loss").pass).toBe(true);
  });
});

describe("concentrated loss", () => {
  test("two stable budget cases failing in the candidate reject, naming the area and both cases", () => {
    const candidate = cheap({ fail: ["budget-limit-es", "budget-failing-es"] });
    const verdict = decideWith(candidate);

    expect(verdict.verdict).toBe("reject");
    expect(check(verdict, "concentrated_loss").pass).toBe(false);
    const reason = verdict.reasons.join("\n");
    expect(reason).toContain("area budget");
    expect(reason).toContain("budget-limit-es");
    expect(reason).toContain("budget-failing-es");
  });

  test("a case that already failed in a baseline run is not a stable loss", () => {
    const baseline = run({ fail: ["budget-limit-es"] });
    const candidate = cheap({ fail: ["budget-limit-es", "budget-failing-es"] });
    expect(check(decideWith(candidate, baseline), "concentrated_loss").pass).toBe(true);
  });
});

describe("the cost target is judged on cold cost against the first baseline run", () => {
  test("$0.0190 against $0.0376 is rejected on cost", () => {
    const verdict = decideWith(cheap({ cost: 0.019 }));

    expect(verdict.verdict).toBe("reject");
    expect(check(verdict, "cost").pass).toBe(false);
    expect(verdict.cost!.baseline_cold_median).toBeCloseTo(0.0376, 12);
    expect(verdict.cost!.limit).toBeCloseTo(0.0188, 12);
  });

  test("$0.0150 passes the cost check, whatever its measured median", () => {
    const verdict = decideWith(cheap({ cost: 0.015 }));
    expect(check(verdict, "cost").pass).toBe(true);
  });

  test("cold, not measured, is what counts: reads that make a cheap warm run expensive cold are rejected", () => {
    // Measured $0.0150 per question, but each first call read 5,000 tokens that a question arriving
    // alone would have had to write: over the limit.
    const candidate = cheap({ cost: 0.015, caching: true, cacheRead: 0 });
    const warmCases = candidate.cases.map((c) => ({
      ...c,
      turns: c.turns.map((t) => ({ ...t, calls: t.calls.map((call) => ({ ...call, cache_read_input_tokens: 5000 })) })),
    }));
    const verdict = decideWith({ ...candidate, cases: warmCases });

    expect(verdict.cost!.candidate_measured_median).toBeCloseTo(0.015, 12);
    expect(verdict.cost!.candidate_cold_median).toBeGreaterThan(0.0188);
    expect(check(verdict, "cost").pass).toBe(false);
  });

  test("the reference is the first baseline run, not the second", () => {
    // Second run costs $0.0200; a candidate at $0.0150 is 75% of it but 40% of the first.
    const verdict = decideWith(cheap({ cost: 0.015 }), run(), run({ cost: 0.02 }));
    expect(check(verdict, "cost").pass).toBe(true);
    expect(verdict.cost!.baseline_cold_median).toBeCloseTo(0.0376, 12);
  });
});

describe("inert caching", () => {
  test("caching on and every call reading zero from the cache is rejected", () => {
    const verdict = decideWith(cheap({ caching: true }));

    expect(verdict.verdict).toBe("reject");
    expect(check(verdict, "inert_caching").pass).toBe(false);
  });

  test("caching on with at least one cache read is not inert", () => {
    const verdict = decideWith(cheap({ caching: true, cacheRead: 100 }));
    expect(check(verdict, "inert_caching").pass).toBe(true);
  });

  test("a record that says caching was off cannot be inert", () => {
    expect(check(decideWith(cheap({ caching: false })), "inert_caching").pass).toBe(true);
  });

  test("a record without the caching field reads as off", () => {
    const candidate = cheap();
    delete candidate.prompt_caching;
    expect(check(decideWith(candidate), "inert_caching").pass).toBe(true);
  });
});

describe("no verdict", () => {
  test("a second baseline run with a different prompt hash gives no verdict and names the mismatch", () => {
    const verdict = decideWith(cheap(), run(), run({ promptHash: "hash-b" }));

    expect(verdict.verdict).toBe("no_verdict");
    expect(verdict.reasons.join("\n")).toMatch(/prompt hash/);
    expect(verdict.checks).toEqual([]);
  });

  test.each([
    ["model", { model: "claude-opus-5-5" }],
    ["effort", { effort: "high" }],
  ] as const)("baselines that differ in %s give no verdict", (field, override) => {
    const verdict = decideWith(cheap(), run(), run(override));
    expect(verdict.verdict).toBe("no_verdict");
    expect(verdict.reasons.join("\n")).toContain(field);
  });

  test.each(["partial", "incomplete"] as const)("a %s record gives no verdict, naming which one", (status) => {
    expect(decideWith(cheap({ status })).reasons.join("\n")).toMatch(new RegExp(`candidate.*${status}`));
    expect(decideWith(cheap(), run({ status })).reasons.join("\n")).toMatch(new RegExp(`baseline.*${status}`));
    expect(decideWith(cheap(), run(), run({ status })).reasons.join("\n")).toMatch(new RegExp(`replicate.*${status}`));
    expect(decideWith(cheap({ status })).verdict).toBe("no_verdict");
  });

  test("a record with an errored case gives no verdict even if its status says complete", () => {
    const verdict = decideWith(cheap({ outcomes: { "conv-a": "error" } }));
    expect(verdict.verdict).toBe("no_verdict");
    expect(verdict.reasons.join("\n")).toContain("conv-a");
  });

  test("records that cover different cases give no verdict rather than comparing counts", () => {
    const extra: CaseRecord = { ...run().cases[0], id: "only-in-candidate" };
    const verdict = decideWith(cheap({ extraCases: [extra] }));
    expect(verdict.verdict).toBe("no_verdict");
    expect(verdict.reasons.join("\n")).toMatch(/same cases/);
  });

  test("a rule violation is never reported once the rule cannot be applied", () => {
    // The candidate would be rejected on cost, but its status makes the rule inapplicable first.
    const verdict = decideWith(cheap({ cost: 0.03, status: "partial" }));
    expect(verdict.verdict).toBe("no_verdict");
  });
});

describe("acceptance waits for the reading", () => {
  test("every check passes and three cases differ from a baseline: accept, provisional, three listed", () => {
    // B1 fails conv-a and conv-b; B2 fails conv-a. The candidate passes conv-a, fails conv-b and fails
    // budget-limit-es on figures (no vetoed grader, one stable loss).
    const baseline = run({ fail: ["conv-a", "conv-b"] });
    const replicate = run({ fail: ["conv-a"] });
    const candidate = cheap({ fail: ["conv-b", "budget-limit-es"] });

    const verdict = decideWith(candidate, baseline, replicate);

    expect(verdict.verdict).toBe("accept_provisional");
    expect(verdict.checks.every((c) => c.pass)).toBe(true);
    expect(verdict.toRead).toEqual([
      { id: "budget-limit-es", area: "budget", baseline: "pass", replicate: "pass", candidate: "fail" },
      { id: "conv-a", area: "conversation", baseline: "fail", replicate: "fail", candidate: "pass" },
      { id: "conv-b", area: "conversation", baseline: "fail", replicate: "pass", candidate: "fail" },
    ]);
    expect(verdict.reasons.join("\n")).toContain("3 listed case(s)");
  });

  test("a candidate identical to the baselines differs from none of them", () => {
    const verdict = decideWith(cheap());
    expect(verdict.toRead).toEqual([]);
    expect(verdict.verdict).toBe("accept_provisional");
  });

  test("the baseline judged as its own candidate is rejected on cost, with no veto", () => {
    const verdict = decideWith(run());

    expect(verdict.verdict).toBe("reject");
    expect(verdict.checks.filter((c) => !c.pass).map((c) => c.name)).toEqual(["cost"]);
    expect(verdict.cost!.cold_pct_of_baseline).toBeCloseTo(100, 12);
  });
});

describe("McNemar beside the verdict", () => {
  test("is reported against the baseline run and does not decide", () => {
    // Five stable cases fail in the candidate, spread over areas so that only the net loss rejects
    // it; McNemar is reported either way.
    const candidate = cheap({ fail: ["budget-limit-es", "docs-rain-es", "abstain-ont-en", "conv-a", "docs-x1"] });
    const baseline = run({ fail: ["conv-a"] });
    const verdict = decideWith(candidate, baseline, run({ fail: ["conv-a"] }));

    // conv-a fails in all three; the other four flip pass to fail against the baseline.
    expect(verdict.mcnemar).toMatchObject({ pass_to_fail: 4, fail_to_pass: 0 });
    expect(verdict.mcnemar!.p).toBe(0.125);
  });

  test("a significant-looking McNemar does not by itself reject, nor a non-significant one accept", () => {
    const accepted = decideWith(cheap());
    expect(accepted.mcnemar).toEqual({ pass_to_fail: 0, fail_to_pass: 0, p: 1 });
    expect(accepted.verdict).toBe("accept_provisional");
  });
});
