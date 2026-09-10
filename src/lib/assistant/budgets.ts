/**
 * Adapters between the optical budget engine and the assistant's two tools.
 *
 * Both functions are thin wrappers over `@/lib/optical/budget` — the
 * arithmetic they expose was already verified against
 * `seed/expected-budgets.json` in the previous change. Nothing here computes
 * a new figure; `summarizeOpticalBudgets` only reshapes the engine's output
 * into the thin row the survey tool returns, and `detailOpticalBudget` is a
 * direct pass-through, named for the tool that calls it.
 */

import {
  calculateAllBudgets,
  calculateBudget,
  type BudgetResult,
  type BudgetStatus,
  type CalculateBudgetOptions,
} from "@/lib/optical/budget";
import type { Network } from "@/lib/network/types";

/** One row of the survey: enough to say which NAPs need a closer look. */
export interface SummaryRow {
  nap_id: string;
  name: string;
  total_loss_db: number;
  margin_db: number;
  status: BudgetStatus;
}

/**
 * One thin row per NAP in `network`. Backs `summarize_optical_budgets` — see
 * design.md, decision 1 for why this exists as its own call rather than
 * requiring the caller to already know every NAP's identifier.
 */
export function summarizeOpticalBudgets(
  network: Network,
  options: CalculateBudgetOptions = {},
): SummaryRow[] {
  const nameById = new Map(network.splitters.map((nap) => [nap.id, nap.name]));

  return calculateAllBudgets(network, options).map((result) => ({
    nap_id: result.nap_id,
    name: nameById.get(result.nap_id) ?? result.nap_id,
    total_loss_db: result.total_loss_db,
    margin_db: result.margin_db,
    status: result.status,
  }));
}

/** The full per-hop breakdown for one NAP. Backs `detail_optical_budget`. */
export function detailOpticalBudget(
  network: Network,
  napId: string,
  options: CalculateBudgetOptions = {},
): BudgetResult {
  return calculateBudget(network, napId, options);
}
