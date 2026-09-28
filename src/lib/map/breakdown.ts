/**
 * Formats a `BudgetResult` into display-ready rows for the breakdown card.
 *
 * Formatting only — see design.md, decision 3, and spec.md, "Clicking a NAP
 * shows its optical budget": every dB and km figure here is `value.toFixed(2)`
 * of the exact number the engine (`calculateBudget`) produced. This module
 * adds, subtracts and rounds nothing; it is not a second implementation of
 * the arithmetic.
 */

import type { BudgetResult, BudgetStatus } from "@/lib/optical/budget";

/** One hop's figures, formatted for display. Counts stay numbers; dB and km figures are strings. */
export interface BreakdownHopRow {
  run_id: string;
  from: string;
  to: string;
  length_km: string;
  fiber_db: string;
  splitter_ratio: string;
  splitter_at: string;
  splitter_db: string;
  connectors: number;
  connectors_db: string;
  splices: number;
  splices_db: string;
}

/** Attenuation by source, formatted. Sums to `total_loss_db`. */
export interface BreakdownTotals {
  fiber_db: string;
  splitters_db: string;
  connectors_db: string;
  splices_db: string;
}

export interface FormattedBreakdown {
  nap_id: string;
  nap_name: string;
  hops: BreakdownHopRow[];
  by_source: BreakdownTotals;
  total_loss_db: string;
  budget_db: string;
  margin_db: string;
  status: BudgetStatus;
}

/** Two-decimal display string for a dB or km figure — the one formatting rule used throughout. */
function db(value: number): string {
  return value.toFixed(2);
}

/**
 * Builds the display rows for `result`. `napName` is passed in rather than
 * looked up so this module needs no `Network` — it only ever touches the
 * `BudgetResult` it is given.
 */
export function formatBreakdown(result: BudgetResult, napName: string): FormattedBreakdown {
  return {
    nap_id: result.nap_id,
    nap_name: napName,
    hops: result.hops.map((hop) => ({
      run_id: hop.run_id,
      from: hop.from,
      to: hop.to,
      length_km: db(hop.length_km),
      fiber_db: db(hop.fiber_db),
      splitter_ratio: hop.splitter.ratio,
      splitter_at: hop.splitter.at,
      splitter_db: db(hop.splitter.loss_db),
      connectors: hop.connectors,
      connectors_db: db(hop.connectors_db),
      splices: hop.splices,
      splices_db: db(hop.splices_db),
    })),
    by_source: {
      fiber_db: db(result.by_source.fiber_db),
      splitters_db: db(result.by_source.splitters_db),
      connectors_db: db(result.by_source.connectors_db),
      splices_db: db(result.by_source.splices_db),
    },
    total_loss_db: db(result.total_loss_db),
    budget_db: db(result.budget_db),
    margin_db: db(result.margin_db),
    status: result.status,
  };
}
