/**
 * The rule that decides whether a cheaper configuration may replace the
 * baseline. Pure: three run records in, a verdict out, no model, no disk, no
 * clock — so a person can recompute any verdict from three committed files.
 *
 * The rule is fixed by the `assistant-evals` spec ("A cheaper configuration
 * is accepted only by a rule fixed in advance") and is not tuned here. How
 * each part maps from an eval of ~80 cases to this one of 21 is in design.md
 * (reduce-cost-per-question), decision 4; the pure/CLI split is decision 5.
 *
 * Summaries are recomputed from case data with `summarizeRun`, never read
 * from a stored `summary`: the baseline records predate the cold-cost field,
 * and recomputing judges all three records by the same code.
 *
 * An accept is always provisional. The automatic checks cannot see a figure
 * attributed to the wrong thing (grounding checks membership), so a person
 * reads every case in `toRead` before the verdict stands.
 */

import { compareRuns } from "@/lib/evals/compare";
import { promptCachingOn } from "@/lib/evals/record";
import { summarizeRun } from "@/lib/evals/stats";
import type { Area, CaseOutcome, CaseRecord, GraderName, RunRecord } from "@/lib/evals/types";

/** The graders that encode the project's hard rules; a regression on either vetoes. */
const VETO_GRADERS: GraderName[] = ["grounding", "abstention"];

/** The candidate's median cold cost may be at most this fraction of the baseline's. */
export const COST_TARGET_FRACTION = 0.5;

export type Verdict = "accept_provisional" | "reject" | "no_verdict";

export type CheckName = "veto" | "net_loss" | "concentrated_loss" | "cost" | "inert_caching";

export interface DecideCheck {
  name: CheckName;
  pass: boolean;
  /** What was found, in a sentence a person can verify against the records. */
  detail: string;
}

/** A case whose outcome in the candidate differs from at least one baseline run. */
export interface CaseToRead {
  id: string;
  area: Area;
  baseline: CaseOutcome;
  replicate: CaseOutcome;
  candidate: CaseOutcome;
}

export interface DecideCost {
  /** Medians over questions, US dollars. */
  baseline_cold_median: number;
  baseline_measured_median: number | null;
  candidate_cold_median: number;
  candidate_measured_median: number | null;
  /** The most the candidate's cold median may be: the target fraction of the baseline's. */
  limit: number;
  /** Percent of the baseline's cold median. */
  cold_pct_of_baseline: number;
  /** Percent of the baseline's measured median; `null` when either measured median is unknown. */
  measured_pct_of_baseline: number | null;
}

export interface DecideResult {
  verdict: Verdict;
  /**
   * Why: for `reject`, one entry per failed check; for `no_verdict`, the causes; for
   * `accept_provisional`, a note that the verdict waits for the reading.
   */
  reasons: string[];
  /** Every check that ran, passed or not. Empty for `no_verdict`. */
  checks: DecideCheck[];
  /** Cases a person must read before an accept stands. Empty for `no_verdict`. */
  toRead: CaseToRead[];
  /** Pass counts of the three runs, from recomputed summaries. `null` for `no_verdict`. */
  passes: { baseline: number; replicate: number; candidate: number } | null;
  /** Against `baseline`, for context only: it never decides. `null` for `no_verdict`. */
  mcnemar: { pass_to_fail: number; fail_to_pass: number; p: number } | null;
  /** `null` for `no_verdict`. */
  cost: DecideCost | null;
}

export interface DecideInput {
  /** The published baseline: the reference for cost and for McNemar. */
  baseline: RunRecord;
  /** A second run of the baseline configuration. */
  replicate: RunRecord;
  candidate: RunRecord;
}

/** The result for a rule that cannot be applied: no verdict, and why. */
export function noVerdict(reasons: string[]): DecideResult {
  return { verdict: "no_verdict", reasons, checks: [], toRead: [], passes: null, mcnemar: null, cost: null };
}

function labelled(role: string, record: RunRecord): string {
  return `${role} (${record.started_at})`;
}

/** Why the rule cannot be applied to these records, if it cannot. */
function inapplicable({ baseline, replicate, candidate }: DecideInput): string[] {
  const problems: string[] = [];

  for (const [role, record] of [
    ["baseline", baseline],
    ["replicate", replicate],
    ["candidate", candidate],
  ] as const) {
    if (record.status !== "complete") {
      problems.push(`${labelled(role, record)} has status ${record.status}, not complete`);
    }
    const unusable = record.cases.filter((c) => c.outcome !== "pass" && c.outcome !== "fail");
    if (unusable.length > 0) {
      problems.push(
        `${labelled(role, record)} has ${unusable.length} case(s) that errored or were skipped: ` +
          unusable.map((c) => `${c.id} (${c.outcome})`).join(", "),
      );
    }
  }

  for (const field of ["model", "effort", "prompt_hash"] as const) {
    if (baseline[field] !== replicate[field]) {
      problems.push(
        `the two baseline runs differ in ${field.replace("_", " ")}: ` +
          `${String(baseline[field])} against ${String(replicate[field])}`,
      );
    }
  }

  // Pass counts are only comparable over the same cases.
  const ids = (record: RunRecord) => record.cases.map((c) => c.id).sort().join("\n");
  if (ids(baseline) !== ids(replicate) || ids(baseline) !== ids(candidate)) {
    problems.push("the three records do not cover the same cases, so pass counts are not comparable");
  }

  return problems;
}

const byId = (record: RunRecord) => new Map(record.cases.map((c) => [c.id, c]));

const graderPassed = (c: CaseRecord | undefined, grader: GraderName): boolean | undefined =>
  c?.graders[grader]?.pass;

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const usd = (x: number) => `$${x.toFixed(4)}`;

/**
 * Applies the rule to a baseline run, a second run of the baseline
 * configuration, and a candidate run. See the module comment for what each
 * verdict means.
 */
export function decide(input: DecideInput): DecideResult {
  const { baseline, replicate, candidate } = input;

  const problems = inapplicable(input);
  if (problems.length > 0) return noVerdict(problems);

  const summaries = {
    baseline: summarizeRun(baseline.cases),
    replicate: summarizeRun(replicate.cases),
    candidate: summarizeRun(candidate.cases),
  };
  const baselineCold = summaries.baseline.cold_cost_per_question.median;
  const candidateCold = summaries.candidate.cold_cost_per_question.median;
  if (baselineCold === null || candidateCold === null) {
    return noVerdict([
      `no question has a known cold cost in the ${baselineCold === null ? "baseline" : "candidate"} run ` +
        "(an unpriced model), so the cost check cannot be applied",
    ]);
  }

  const base = byId(baseline);
  const rep = byId(replicate);
  const cand = byId(candidate);
  const stable = candidate.cases.filter((c) => base.get(c.id)?.outcome === "pass" && rep.get(c.id)?.outcome === "pass");

  // Veto: a stable grounding or abstention grader fails in the candidate.
  const vetoes: Array<{ case: string; grader: GraderName }> = [];
  for (const c of candidate.cases) {
    for (const grader of VETO_GRADERS) {
      const stableOnCase = graderPassed(base.get(c.id), grader) === true && graderPassed(rep.get(c.id), grader) === true;
      if (stableOnCase && graderPassed(c, grader) === false) vetoes.push({ case: c.id, grader });
    }
  }

  // Net loss: fewer passes than the lower baseline count, minus one.
  const passes = {
    baseline: summaries.baseline.overall.passes,
    replicate: summaries.replicate.overall.passes,
    candidate: summaries.candidate.overall.passes,
  };
  const floor = Math.min(passes.baseline, passes.replicate) - 1;

  // Concentrated loss: two or more stable cases of one area fail in the candidate.
  const lostByArea = new Map<Area, string[]>();
  for (const c of stable) {
    if (cand.get(c.id)?.outcome === "fail") lostByArea.set(c.area, [...(lostByArea.get(c.area) ?? []), c.id]);
  }
  const concentrated = [...lostByArea].filter(([, ids]) => ids.length >= 2);

  // Cost: the candidate's median cold cost against a fraction of the baseline's.
  const limit = baselineCold * COST_TARGET_FRACTION;
  const baselineMeasured = summaries.baseline.cost_per_question.median;
  const candidateMeasured = summaries.candidate.cost_per_question.median;
  const cost: DecideCost = {
    baseline_cold_median: baselineCold,
    baseline_measured_median: baselineMeasured,
    candidate_cold_median: candidateCold,
    candidate_measured_median: candidateMeasured,
    limit,
    cold_pct_of_baseline: (candidateCold / baselineCold) * 100,
    measured_pct_of_baseline:
      baselineMeasured !== null && candidateMeasured !== null && baselineMeasured > 0
        ? (candidateMeasured / baselineMeasured) * 100
        : null,
  };

  // Inert caching: caching said on, and not one call read from the cache.
  const calls = candidate.cases.flatMap((c) => c.turns.flatMap((t) => t.calls));
  const inert = promptCachingOn(candidate) && !calls.some((call) => call.cache_read_input_tokens > 0);

  const checks: DecideCheck[] = [
    {
      name: "veto",
      pass: vetoes.length === 0,
      detail:
        vetoes.length === 0
          ? "no stable grounding or abstention grader fails in the candidate"
          : vetoes
              .map((v) => `${v.grader} grader is stable on ${v.case} (passes in both baseline runs) and fails in the candidate`)
              .join("; "),
    },
    {
      name: "net_loss",
      pass: passes.candidate >= floor,
      detail:
        `candidate passes ${passes.candidate}; baseline runs pass ${passes.baseline} and ${passes.replicate}, ` +
        `so the floor is ${floor} (the lower count minus one)`,
    },
    {
      name: "concentrated_loss",
      pass: concentrated.length === 0,
      detail:
        concentrated.length === 0
          ? "no area has two or more stable cases failing in the candidate"
          : concentrated
              .map(([area, ids]) => `area ${area}: ${ids.length} stable cases fail in the candidate (${ids.join(", ")})`)
              .join("; "),
    },
    {
      name: "cost",
      pass: candidateCold <= limit,
      detail:
        `candidate median cold cost ${usd(candidateCold)} is ${cost.cold_pct_of_baseline.toFixed(1)}% of the ` +
        `baseline's ${usd(baselineCold)}; the limit is ${usd(limit)} (${COST_TARGET_FRACTION * 100}%)`,
    },
    {
      name: "inert_caching",
      pass: !inert,
      detail: inert
        ? "the candidate ran with prompt caching on and recorded no cache reads on any call"
        : promptCachingOn(candidate)
          ? "the candidate ran with prompt caching on and recorded cache reads"
          : "the candidate ran with prompt caching off",
    },
  ];

  const toRead: CaseToRead[] = candidate.cases
    .filter((c) => c.outcome !== base.get(c.id)?.outcome || c.outcome !== rep.get(c.id)?.outcome)
    .map((c) => ({
      id: c.id,
      area: c.area,
      baseline: base.get(c.id)!.outcome,
      replicate: rep.get(c.id)!.outcome,
      candidate: c.outcome,
    }));

  const comparison = compareRuns(baseline, candidate);
  const mcnemar = {
    pass_to_fail: comparison.pass_to_fail.length,
    fail_to_pass: comparison.fail_to_pass.length,
    p: comparison.mcnemar_p,
  };

  const failed = checks.filter((check) => !check.pass);
  if (failed.length > 0) {
    return {
      verdict: "reject",
      reasons: failed.map((check) => `${check.name}: ${check.detail}`),
      checks,
      toRead,
      passes,
      mcnemar,
      cost,
    };
  }
  return {
    verdict: "accept_provisional",
    reasons: [
      `every automatic check passed; the verdict stands only after a person reads the ${toRead.length} ` +
        `listed case(s) and records the reading (candidate pass rate ${pct(summaries.candidate.overall.rate ?? 0)})`,
    ],
    checks,
    toRead,
    passes,
    mcnemar,
    cost,
  };
}
