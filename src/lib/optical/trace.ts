/**
 * The subscriber link budget: the OLT to one subscriber's ONT.
 *
 * A trace is two parts. The serving NAP's budget comes from `calculateBudget`,
 * unchanged, so a subscriber's path is by construction the path the NAP detail
 * and the map already show: this module never walks the tree itself. The drop,
 * the last stretch from the NAP to the subscriber, is modelled by
 * `@/lib/optical/drop` (shared with the feasibility engine, see design.md
 * (add-feasibility), decision 1) from the straight-line distance, a slack
 * factor and the connectors a drop adds.
 *
 * Every figure is derived from `@/lib/optical/constants`; no literal loss value
 * lives in this file. Link figures are computed from the already-reported
 * (rounded) figures, so any line of the result can be checked against the line
 * above it. See design.md (add-subscriber-trace), decisions 1, 2 and 6.
 *
 * Received power is an estimate and does not classify. No receiver sensitivity
 * is modelled, so the result carries no field that says whether the ONT works.
 */

import {
  calculateBudget,
  round2,
  type BudgetBySource,
  type BudgetResult,
  type BudgetStatus,
  type CalculateBudgetOptions,
} from "@/lib/optical/budget";
import { modelDrop, projectLink, type SubscriberDrop } from "@/lib/optical/drop";
import type { GponClass, Network } from "@/lib/network/types";

export type { SubscriberDrop };

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

  const drop = modelDrop(nap, subscriber);
  const link = projectLink(napBudget, drop);

  return {
    subscriber_id: subscriber.id,
    subscriber_name: subscriber.name,
    nap_id: nap.id,
    nap_name: nap.name,
    gpon_class: napBudget.gpon_class,
    budget_db: napBudget.budget_db,
    min_margin_db: napBudget.min_margin_db,
    nap: napBudget,
    drop,
    by_source: link.by_source,
    total_loss_db: link.total_loss_db,
    margin_db: link.margin_db,
    status: link.status,
    rx_power_dbm: round2(network.olt.tx_power_dbm - link.total_loss_db),
  };
}
