/**
 * Ordering of the statuses a map payload entry can carry, shared by everything
 * that merges entries naming the same entity (the payload projection and the
 * map resolver). See design.md (add-subscriber-trace), decision 7, for the
 * budget classifications (`fail` over `marginal` over `pass`), and design.md
 * (add-cut-impact), decision 5, for the impact statuses: an outage outranks any
 * classification, and the cut element outranks what it takes down.
 *
 * The module stays in `optical/` so the client keeps its existing import.
 */

import type { BudgetStatus } from "@/lib/optical/budget";

/** What a cut does to an element: the cut one itself, or something downstream of it. */
export type ImpactStatus = "cut" | "out_of_service";

/** Every status a payload entry can carry. */
export type HighlightStatus = BudgetStatus | ImpactStatus;

const SEVERITY: Record<HighlightStatus, number> = {
  pass: 0,
  marginal: 1,
  fail: 2,
  out_of_service: 3,
  cut: 4,
};

/** True for the statuses a cut produces, which carry no margin. */
export function isImpactStatus(status: HighlightStatus): status is ImpactStatus {
  return status === "cut" || status === "out_of_service";
}

/**
 * The more severe of two statuses: `cut`, then `out_of_service`, then `fail`,
 * `marginal`, `pass`. On a tie, the first.
 */
export function worseStatus<T extends HighlightStatus>(a: T, b: T): T {
  return SEVERITY[b] > SEVERITY[a] ? b : a;
}
