/**
 * The optical power budget engine.
 *
 * Walks the downstream path from a NAP up to the OLT, accumulates every loss
 * contributor along the way using the constants in `@/lib/optical/constants`,
 * and reports the total attenuation, the margin against the OLT's declared
 * GPON class, and the classification that follows from it.
 *
 * This module contains no literal loss figures: every dB value it produces is
 * derived from the constants module. See design.md for the decisions behind
 * this shape.
 */

import { GPON_CLASS, CONNECTOR_DB, FIBER_DB_PER_KM, MIN_MARGIN_DB, SPLICE_DB, SPLITTER_DB } from "@/lib/optical/constants";
import type { Nap, Network, GponClass } from "@/lib/network/types";

/** Rounds to two decimal places. The single place precision policy lives. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The splitter terminating one hop, and its contribution to that hop's loss. */
export interface HopSplitter {
  /** Id of the NAP the splitter is housed in. */
  at: string;
  ratio: Nap["ratio"];
  loss_db: number;
}

/**
 * One fiber run on the path from the OLT to a NAP, with every loss contributor
 * it carries. Hops are ordered OLT-side first.
 */
export interface Hop {
  run_id: string;
  from: string;
  to: string;
  length_km: number;
  fiber_db: number;
  splitter: HopSplitter;
  connectors: number;
  connectors_db: number;
  splices: number;
  splices_db: number;
}

/** Loss attenuation broken down by source, in dB. Sums to `total_loss_db`. */
export interface BudgetBySource {
  fiber_db: number;
  splitters_db: number;
  connectors_db: number;
  splices_db: number;
}

export type BudgetStatus = "pass" | "marginal" | "fail";

export interface BudgetResult {
  nap_id: string;
  gpon_class: GponClass;
  /** The link budget for `gpon_class`, in dB. */
  budget_db: number;
  /** The recommended minimum margin applied for classification, in dB. */
  min_margin_db: number;
  /** Total attenuation from the OLT to this NAP, in dB. */
  total_loss_db: number;
  /** `budget_db - total_loss_db`. */
  margin_db: number;
  status: BudgetStatus;
  /**
   * Optical power arriving at the NAP, in dBm: the OLT's declared transmit
   * power less `total_loss_db`. Informational only — it does not participate
   * in `margin_db` or `status`.
   */
  rx_power_dbm: number;
  by_source: BudgetBySource;
  /** The path from the OLT to this NAP, OLT-side hop first. */
  hops: Hop[];
}

export interface CalculateBudgetOptions {
  /** Overrides `MIN_MARGIN_DB` for this call. */
  minMarginDb?: number;
}

/**
 * Walks from `napId` up to the OLT, returning the ordered hops (OLT-side
 * first) with every loss contributor attached.
 *
 * Throws if `napId` does not name a NAP in `network`, or if the walk does not
 * reach the OLT within `network.splitters.length` steps — which a `Network`
 * assembled by hand (rather than produced by `loadNetwork`) could otherwise
 * turn into an infinite loop.
 */
function walkToOlt(network: Network, napId: string): Hop[] {
  const napById = new Map(network.splitters.map((nap) => [nap.id, nap]));
  const runTo = new Map(network.fiber_runs.map((run) => [run.to, run]));

  if (!napById.has(napId)) {
    throw new Error(`Unknown NAP: ${napId}`);
  }

  const hops: Hop[] = [];
  const visited = new Set<string>();
  let cursor = napId;

  while (cursor !== network.olt.id) {
    if (visited.has(cursor)) {
      throw new Error(
        `Cascade cycle detected while walking to the OLT: revisited ${cursor}. ` +
          `Visited so far: ${[...visited].join(" -> ")}`,
      );
    }
    visited.add(cursor);

    const nap = napById.get(cursor);
    if (nap === undefined) {
      throw new Error(`Unknown node while walking to the OLT: ${cursor}`);
    }
    const run = runTo.get(cursor);
    if (run === undefined) {
      throw new Error(`No fiber run reaches ${cursor}`);
    }

    hops.push({
      run_id: run.id,
      from: run.from,
      to: run.to,
      length_km: run.length_km,
      fiber_db: run.length_km * FIBER_DB_PER_KM,
      splitter: {
        at: nap.id,
        ratio: nap.ratio,
        loss_db: SPLITTER_DB[nap.ratio],
      },
      connectors: run.connectors,
      connectors_db: run.connectors * CONNECTOR_DB,
      splices: run.splices,
      splices_db: run.splices * SPLICE_DB,
    });

    cursor = nap.parent;
  }

  hops.reverse();
  return hops;
}

/** Rounds every dB figure on a hop to two decimals, for the result surface. */
function roundHop(hop: Hop): Hop {
  return {
    ...hop,
    fiber_db: round2(hop.fiber_db),
    splitter: { ...hop.splitter, loss_db: round2(hop.splitter.loss_db) },
    connectors_db: round2(hop.connectors_db),
    splices_db: round2(hop.splices_db),
  };
}

/**
 * Computes the optical power budget of the downstream link from the OLT to
 * `napId`.
 *
 * Throws if `napId` is not in `network` — never a zeroed, partial or
 * otherwise fabricated result.
 */
export function calculateBudget(
  network: Network,
  napId: string,
  options: CalculateBudgetOptions = {},
): BudgetResult {
  const hops = walkToOlt(network, napId);

  // Accumulate at full precision; round once, at the boundary below.
  let fiberDb = 0;
  let splittersDb = 0;
  let connectorsDb = 0;
  let splicesDb = 0;
  for (const hop of hops) {
    fiberDb += hop.fiber_db;
    splittersDb += hop.splitter.loss_db;
    connectorsDb += hop.connectors_db;
    splicesDb += hop.splices_db;
  }

  // Round the total once here: everything derived from it below — margin,
  // status, received power — subtracts from this *reported* figure rather
  // than from the raw accumulation. Deriving margin from the raw sum instead
  // can disagree with the fixture at floating-point rounding boundaries (see
  // NAP-11: 28 - 15.665000000000001 rounds to 12.34, but 28 - 15.67 is
  // 12.33, and the fixture was built the second way). A reported number is
  // meant to be read and subtracted like the figure on a page, not re-opened
  // to its internal float precision.
  const totalLossDb = round2(fiberDb + splittersDb + connectorsDb + splicesDb);

  const gponClass = network.olt.gpon_class;
  const budgetDb = GPON_CLASS[gponClass].budget_db;
  const marginDb = round2(budgetDb - totalLossDb);

  const minMarginDb = options.minMarginDb ?? MIN_MARGIN_DB;
  const status: BudgetStatus = marginDb < 0 ? "fail" : marginDb < minMarginDb ? "marginal" : "pass";

  const rxPowerDbm = round2(network.olt.tx_power_dbm - totalLossDb);

  return {
    nap_id: napId,
    gpon_class: gponClass,
    budget_db: round2(budgetDb),
    min_margin_db: round2(minMarginDb),
    total_loss_db: totalLossDb,
    margin_db: marginDb,
    status,
    rx_power_dbm: rxPowerDbm,
    by_source: {
      fiber_db: round2(fiberDb),
      splitters_db: round2(splittersDb),
      connectors_db: round2(connectorsDb),
      splices_db: round2(splicesDb),
    },
    hops: hops.map(roundHop),
  };
}

/**
 * Computes the budget for every NAP in `network`.
 *
 * A plain map over {@link calculateBudget}, in the order `network.splitters`
 * lists them: there is exactly one implementation of the arithmetic, and this
 * function is not a second one. See design.md, decision 6.
 */
export function calculateAllBudgets(
  network: Network,
  options: CalculateBudgetOptions = {},
): BudgetResult[] {
  return network.splitters.map((nap) => calculateBudget(network, nap.id, options));
}
