/**
 * Pairs two run records case by case and lists every outcome that flipped.
 *
 * Over two runs of the same configuration, the flips are pure noise — the
 * level of discordance a later comparison must exceed before it means
 * anything — and the flipped cases are unstable. Statistical testing on these
 * counts belongs to reduce-cost-per-question; this only counts and names.
 * See design.md (add-eval-harness), decision 13.
 */

import type { CaseOutcome, RunRecord } from "@/lib/evals/types";

export interface RunComparison {
  /** Cases completed in both runs. */
  compared: number;
  pass_to_fail: string[];
  fail_to_pass: string[];
  /** Every case whose outcome flipped, either way. */
  unstable: string[];
  only_in_a: string[];
  only_in_b: string[];
  /** Present in both, but errored or skipped in at least one — excluded from the counts. */
  excluded: Array<{ id: string; a: CaseOutcome; b: CaseOutcome }>;
}

const completed = (outcome: CaseOutcome) => outcome === "pass" || outcome === "fail";

export function compareRuns(a: RunRecord, b: RunRecord): RunComparison {
  const outcomesB = new Map(b.cases.map((c) => [c.id, c.outcome]));
  const idsA = new Set(a.cases.map((c) => c.id));

  const result: RunComparison = {
    compared: 0,
    pass_to_fail: [],
    fail_to_pass: [],
    unstable: [],
    only_in_a: [],
    only_in_b: b.cases.filter((c) => !idsA.has(c.id)).map((c) => c.id),
    excluded: [],
  };

  for (const { id, outcome: outcomeA } of a.cases) {
    const outcomeB = outcomesB.get(id);
    if (outcomeB === undefined) {
      result.only_in_a.push(id);
      continue;
    }
    if (!completed(outcomeA) || !completed(outcomeB)) {
      result.excluded.push({ id, a: outcomeA, b: outcomeB });
      continue;
    }
    result.compared++;
    if (outcomeA === "pass" && outcomeB === "fail") result.pass_to_fail.push(id);
    if (outcomeA === "fail" && outcomeB === "pass") result.fail_to_pass.push(id);
  }

  result.unstable = [...result.pass_to_fail, ...result.fail_to_pass];
  return result;
}
