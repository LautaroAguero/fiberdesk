/**
 * The drop: the last stretch of fiber from a NAP to one end customer.
 *
 * Two callers need it. The subscriber trace models the drop of an existing
 * subscriber; the feasibility engine models the drop of a hypothetical one at
 * a point on the map. Both call the functions below, so the two can never
 * disagree about what a drop costs, and "the projection at SUB-025's position
 * equals SUB-025's trace" holds by construction rather than by two copies of a
 * pending-validation model staying in step. See design.md (add-feasibility),
 * decision 1.
 *
 * Every figure is derived from `@/lib/optical/constants`; no literal loss value
 * lives in this file. The functions are a straight move of the code that used
 * to sit inside `traceSubscriber`, so the trace's results and its oracle are
 * unchanged.
 */

import { haversineKm } from "@/lib/geo/distance";
import {
  round2,
  type BudgetBySource,
  type BudgetResult,
  type BudgetStatus,
} from "@/lib/optical/budget";
import {
  CONNECTOR_DB,
  DROP_CONNECTORS,
  DROP_SLACK_FACTOR,
  FIBER_DB_PER_KM,
} from "@/lib/optical/constants";
import type { Position } from "@/lib/network/types";

/** Rounds to three decimal places, for lengths in km. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** The drop from the serving NAP to the customer. A modelled estimate. */
export interface SubscriberDrop {
  /** Great-circle distance from the NAP to the customer, in km. */
  straight_line_km: number;
  /** The slack factor applied (route length over straight-line distance). */
  slack_factor: number;
  /** Modelled route length of the drop, in km. */
  length_km: number;
  /** Fiber loss over `length_km`, in dB. */
  fiber_db: number;
  /** Connectors the drop adds. */
  connectors: number;
  /** Connector loss of the drop, in dB. */
  connectors_db: number;
  /** `fiber_db + connectors_db`, in dB. */
  loss_db: number;
}

/** The link from the OLT to a customer: the NAP's budget plus a drop. */
export interface ProjectedLink {
  /** The NAP's by-source figures plus the drop's fiber and connectors. */
  by_source: BudgetBySource;
  /** Total attenuation from the OLT to the customer's ONT, in dB. */
  total_loss_db: number;
  /** `budget_db - total_loss_db`. */
  margin_db: number;
  /** The link's own classification; it is not inherited from the NAP. */
  status: BudgetStatus;
}

/** Models the drop between a NAP (`from`) and a customer (`to`). */
export function modelDrop(from: Position, to: Position): SubscriberDrop {
  const straightKm = haversineKm(from, to);
  const routeKm = straightKm * DROP_SLACK_FACTOR;

  const dropFiberDb = round2(routeKm * FIBER_DB_PER_KM);
  const dropConnectorsDb = round2(DROP_CONNECTORS * CONNECTOR_DB);
  const dropLossDb = round2(dropFiberDb + dropConnectorsDb);

  return {
    straight_line_km: round3(straightKm),
    slack_factor: DROP_SLACK_FACTOR,
    length_km: round3(routeKm),
    fiber_db: dropFiberDb,
    connectors: DROP_CONNECTORS,
    connectors_db: dropConnectorsDb,
    loss_db: dropLossDb,
  };
}

/**
 * Adds `drop` to the NAP's budget exactly as reported (already rounded), so
 * any line of the result can be checked against the line above it.
 */
export function projectLink(napBudget: BudgetResult, drop: SubscriberDrop): ProjectedLink {
  const totalLossDb = round2(napBudget.total_loss_db + drop.loss_db);
  const marginDb = round2(napBudget.budget_db - totalLossDb);
  const status: BudgetStatus =
    marginDb < 0 ? "fail" : marginDb < napBudget.min_margin_db ? "marginal" : "pass";

  return {
    by_source: {
      fiber_db: round2(napBudget.by_source.fiber_db + drop.fiber_db),
      splitters_db: napBudget.by_source.splitters_db,
      connectors_db: round2(napBudget.by_source.connectors_db + drop.connectors_db),
      splices_db: napBudget.by_source.splices_db,
    },
    total_loss_db: totalLossDb,
    margin_db: marginDb,
    status,
  };
}
