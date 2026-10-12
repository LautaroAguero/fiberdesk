/**
 * Ordering of the three classifications, shared by everything that merges
 * entries naming the same entity (the payload projection and the map resolver).
 * See design.md (add-subscriber-trace), decision 7: `fail` over `marginal` over
 * `pass`.
 */

import type { BudgetStatus } from "@/lib/optical/budget";

const SEVERITY: Record<BudgetStatus, number> = { pass: 0, marginal: 1, fail: 2 };

/** The worse of two classifications: `fail` over `marginal` over `pass`. */
export function worseStatus(a: BudgetStatus, b: BudgetStatus): BudgetStatus {
  return SEVERITY[b] > SEVERITY[a] ? b : a;
}
