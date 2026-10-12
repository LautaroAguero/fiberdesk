/**
 * The subscriber link budget: the OLT to one subscriber's ONT.
 *
 * A trace is two parts. The serving NAP's budget comes from `calculateBudget`,
 * unchanged, so a subscriber's path is by construction the path the NAP detail
 * and the map already show: this module never walks the tree itself. The drop,
 * the last stretch from the NAP to the subscriber, is modelled here from the
 * straight-line distance, a slack factor and the connectors a drop adds.
 *
 * Every figure is derived from `@/lib/optical/constants`; no literal loss value
 * lives in this file. Link figures are computed from the already-reported
 * (rounded) figures, so any line of the result can be checked against the line
 * above it. See design.md (add-subscriber-trace), decisions 1, 2 and 6.
 *
 * Received power is an estimate and does not classify. No receiver sensitivity
 * is modelled, so the result carries no field that says whether the ONT works.
 */

import { haversineKm } from "@/lib/geo/distance";
import {
  calculateBudget,
  round2,
  type BudgetBySource,
  type BudgetResult,
  type BudgetStatus,
  type CalculateBudgetOptions,
} from "@/lib/optical/budget";
import {
  CONNECTOR_DB,
  DROP_CONNECTORS,
  DROP_SLACK_FACTOR,
  FIBER_DB_PER_KM,
} from "@/lib/optical/constants";
import type { GponClass, Network } from "@/lib/network/types";

/** Rounds to three decimal places, for lengths in km. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** The drop from the serving NAP to the subscriber. A modelled estimate. */
export interface SubscriberDrop {
  /** Great-circle distance from the NAP to the subscriber, in km. */
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

export interface SubscriberTrace {
  subscriber_id: string;
  subscriber_name: string;
  nap_id: string;
  nap_name: string;
  gpon_class: GponClass;
  /** The link budget for `gpon_class`, in dB. */
  budget_db: number;
  /** The recommended minimum margin applied for classification, in dB. */
  min_margin_db: number;
  /** The serving NAP's own budget, exactly as `calculateBudget` reports it. */
  nap: BudgetResult;
  drop: SubscriberDrop;
  /** The NAP's by-source figures plus the drop's fiber and connectors. */
  by_source: BudgetBySource;
  /** Total attenuation from the OLT to the subscriber's ONT, in dB. */
  total_loss_db: number;
  /** `budget_db - total_loss_db`. */
  margin_db: number;
  /** The subscriber's own classification; it is not inherited from the NAP. */
  status: BudgetStatus;
  /**
   * Estimated optical power at the ONT, in dBm: the OLT's declared transmit
   * power less `total_loss_db`. Informational only: it takes no part in
   * `margin_db` or `status`.
   */
  rx_power_dbm: number;
}

/**
 * Computes the link budget from the OLT to `subscriberId`'s ONT.
 *
 * Throws, naming the identifier, if `subscriberId` is not in `network`: never a
 * zeroed, partial or estimated result.
 */
export function traceSubscriber(
  network: Network,
  subscriberId: string,
  options: CalculateBudgetOptions = {},
): SubscriberTrace {
  const subscriber = network.subscribers.find((s) => s.id === subscriberId);
  if (subscriber === undefined) {
    throw new Error(`Unknown subscriber: ${subscriberId}`);
  }
  const nap = network.splitters.find((n) => n.id === subscriber.nap);
  if (nap === undefined) {
    throw new Error(`Subscriber ${subscriberId} names an unknown NAP: ${subscriber.nap}`);
  }

  const napBudget = calculateBudget(network, nap.id, options);

  const straightKm = haversineKm(nap, subscriber);
  const routeKm = straightKm * DROP_SLACK_FACTOR;

  const dropFiberDb = round2(routeKm * FIBER_DB_PER_KM);
  const dropConnectorsDb = round2(DROP_CONNECTORS * CONNECTOR_DB);
  const dropLossDb = round2(dropFiberDb + dropConnectorsDb);

  const totalLossDb = round2(napBudget.total_loss_db + dropLossDb);
  const marginDb = round2(napBudget.budget_db - totalLossDb);
  const status: BudgetStatus =
    marginDb < 0 ? "fail" : marginDb < napBudget.min_margin_db ? "marginal" : "pass";

  return {
    subscriber_id: subscriber.id,
    subscriber_name: subscriber.name,
    nap_id: nap.id,
    nap_name: nap.name,
    gpon_class: napBudget.gpon_class,
    budget_db: napBudget.budget_db,
    min_margin_db: napBudget.min_margin_db,
    nap: napBudget,
    drop: {
      straight_line_km: round3(straightKm),
      slack_factor: DROP_SLACK_FACTOR,
      length_km: round3(routeKm),
      fiber_db: dropFiberDb,
      connectors: DROP_CONNECTORS,
      connectors_db: dropConnectorsDb,
      loss_db: dropLossDb,
    },
    by_source: {
      fiber_db: round2(napBudget.by_source.fiber_db + dropFiberDb),
      splitters_db: napBudget.by_source.splitters_db,
      connectors_db: round2(napBudget.by_source.connectors_db + dropConnectorsDb),
      splices_db: napBudget.by_source.splices_db,
    },
    total_loss_db: totalLossDb,
    margin_db: marginDb,
    status,
    rx_power_dbm: round2(network.olt.tx_power_dbm - totalLossDb),
  };
}
