/**
 * Connection feasibility: can a new customer be connected at a point?
 *
 * For a point, the three NAPs nearest to it are always evaluated, each against
 * three checks: is the drop short enough, is a port free, and does the link
 * still close its budget once the drop is added. Every check is code. The drop
 * is the one the subscriber trace uses (`@/lib/optical/drop`), the NAP budget
 * is `calculateBudget` unchanged, and the free ports come from
 * `@/lib/topology/ports`, so nothing here re-derives a figure another module
 * already owns. No id or figure from the seed appears in this file. See
 * design.md (add-feasibility), decisions 1 to 4.
 *
 * A candidate is never left out for being too far, full or failing: its
 * projection is computed regardless, so every failing check can be named.
 * Feasibility is a hypothetical query: nothing is written to the network.
 */

import { haversineKm } from "@/lib/geo/distance";
import {
  calculateBudget,
  type BudgetBySource,
  type BudgetStatus,
} from "@/lib/optical/budget";
import { MAX_DROP_ROUTE_M } from "@/lib/optical/constants";
import { modelDrop, projectLink, type SubscriberDrop } from "@/lib/optical/drop";
import type { GponClass, Network, SplitterRatio } from "@/lib/network/types";
import { isInsideCity } from "@/lib/network/validate";
import { freePorts, type NapPorts } from "@/lib/topology/ports";

/** NAPs evaluated per point. A product choice (owner, 2026-10-12), not physics. */
export const CANDIDATE_COUNT = 3;

/** Why a candidate is not feasible, in the fixed order they are reported. */
export type InfeasibleReason = "too_far" | "no_free_ports" | "budget_fail";

export interface ConnectionCandidate {
  /** 1-based position after sorting: feasible first, then by distance. */
  rank: number;
  nap_id: string;
  nap_name: string;
  ratio: SplitterRatio;
  /** Straight-line distance from the NAP to the point, in metres. */
  straight_line_m: number;
  /** Modelled drop route length, in metres. This is what is compared with the maximum. */
  route_m: number;
  ports: NapPorts;
  /** The drop exactly as the subscriber trace states it (in km). */
  drop: SubscriberDrop;
  /** The NAP's own budget, as the budget engine reports it. */
  nap_total_loss_db: number;
  nap_margin_db: number;
  nap_status: BudgetStatus;
  /** The link of a new subscriber at the point: the NAP's budget plus the drop. */
  projected: {
    by_source: BudgetBySource;
    total_loss_db: number;
    margin_db: number;
    status: BudgetStatus;
  };
  feasible: boolean;
  /** Every check that fails, in a fixed order. Empty when feasible. */
  reasons: InfeasibleReason[];
}

export interface ConnectionFeasibility {
  /** The point evaluated, echoed exactly as given. */
  point: { lat: number; lon: number };
  gpon_class: GponClass;
  budget_db: number;
  min_margin_db: number;
  max_drop_route_m: number;
  candidates: ConnectionCandidate[];
  /** The rank-1 candidate when it is feasible, else null. */
  best_nap_id: string | null;
  /** Computed here so no caller has to count. */
  feasible_count: number;
}

/** Whole metres, halves up: the convention of every other figure the engine reports. */
function toMetres(km: number): number {
  return Math.round(km * 1000);
}

/**
 * Evaluates the three NAPs nearest to `point`.
 *
 * Throws, naming the problem, for a point that is not finite or lies outside
 * the modelled city, and for an oversubscribed NAP: never a partial list.
 */
export function evaluateConnection(
  network: Network,
  point: { lat: number; lon: number },
): ConnectionFeasibility {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) {
    throw new Error(`The point (${point.lat}, ${point.lon}) is not a finite latitude and longitude`);
  }
  if (!isInsideCity(point)) {
    throw new Error(`The point (${point.lat}, ${point.lon}) is outside the modelled city`);
  }

  const ports = freePorts(network);
  const position = { lat: point.lat, lon: point.lon };

  // Nearest first by the UNROUNDED distance; ties by id.
  const nearest = network.splitters
    .map((nap) => ({ nap, distanceKm: haversineKm(nap, position) }))
    .sort((a, b) => a.distanceKm - b.distanceKm || (a.nap.id < b.nap.id ? -1 : a.nap.id > b.nap.id ? 1 : 0))
    .slice(0, CANDIDATE_COUNT);

  const evaluated = nearest.map(({ nap }) => {
    const napBudget = calculateBudget(network, nap.id);
    const drop = modelDrop(nap, position);
    const link = projectLink(napBudget, drop);
    const napPorts = ports.get(nap.id);
    if (napPorts === undefined) throw new Error(`No ports computed for ${nap.id}`);

    const routeM = toMetres(drop.length_km);
    const reasons: InfeasibleReason[] = [];
    if (routeM > MAX_DROP_ROUTE_M) reasons.push("too_far");
    if (napPorts.free <= 0) reasons.push("no_free_ports");
    if (link.status === "fail") reasons.push("budget_fail");

    const candidate: ConnectionCandidate = {
      rank: 0,
      nap_id: nap.id,
      nap_name: nap.name,
      ratio: nap.ratio,
      straight_line_m: toMetres(drop.straight_line_km),
      route_m: routeM,
      ports: napPorts,
      drop,
      nap_total_loss_db: napBudget.total_loss_db,
      nap_margin_db: napBudget.margin_db,
      nap_status: napBudget.status,
      projected: {
        by_source: link.by_source,
        total_loss_db: link.total_loss_db,
        margin_db: link.margin_db,
        status: link.status,
      },
      feasible: reasons.length === 0,
      reasons,
    };
    return { candidate, napBudget };
  });
  if (evaluated.length === 0) throw new Error("The network has no NAPs to evaluate");

  // Feasible first; each group keeps the distance order (the sort is stable).
  const ranked = [...evaluated]
    .sort((a, b) => Number(!a.candidate.feasible) - Number(!b.candidate.feasible))
    .map(({ candidate }, index) => ({ ...candidate, rank: index + 1 }));

  const first = ranked[0];
  // Class, budget and minimum margin are the same for every NAP: one OLT.
  const { napBudget: reference } = evaluated[0];

  return {
    point: { lat: point.lat, lon: point.lon },
    gpon_class: reference.gpon_class,
    budget_db: reference.budget_db,
    min_margin_db: reference.min_margin_db,
    max_drop_route_m: MAX_DROP_ROUTE_M,
    candidates: ranked,
    best_nap_id: first.feasible ? first.nap_id : null,
    feasible_count: ranked.filter((c) => c.feasible).length,
  };
}
