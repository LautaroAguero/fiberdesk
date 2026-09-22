/**
 * Resolves a turn's `HighlightPayload` against the loaded network and its
 * precomputed budgets into exactly what the map needs to paint: which NAPs
 * get which status colour, which fiber runs lie on a highlighted path back
 * to the OLT, which payload ids name no NAP the map knows, and the bounds to
 * fit the view to.
 *
 * Pure and DOM-free — see design.md, decision 3. `runIds` are read off each
 * NAP's own `BudgetResult.hops`, the engine's own path walk; this module
 * never re-derives a path by walking `parent` links itself. The status shown
 * is always the payload's own — see design.md, decision 2: the highlight
 * colours only what the payload names, with the status the payload carries,
 * not a re-classification from `budgets`.
 */

import { toLngLat } from "@/lib/map/geojson";
import type { HighlightPayload } from "@/lib/assistant/events";
import type { BudgetResult, BudgetStatus } from "@/lib/optical/budget";
import type { Network } from "@/lib/network/types";

/** A LngLat bounding box as MapLibre's `fitBounds` expects it: `[[west, south], [east, north]]`. */
export type LngLatBoundsTuple = [[number, number], [number, number]];

export interface ResolvedHighlight {
  /** Status to paint each known, highlighted NAP with, keyed by its id. */
  napStatus: Record<string, BudgetStatus>;
  /** Ids of every fiber run on a highlighted NAP's path back to the OLT. */
  runIds: string[];
  /**
   * Status to paint each run in `runIds` with, keyed by run id — the status of
   * the highlighted NAP that run's hop belongs to (design.md, decision 2: "the
   * highlighted path takes its NAP's status colour"). Not part of the original
   * task 2.2 shape; added for the map layer (task 4.3), which needs a colour
   * per run, not just a flat id list. If two highlighted NAPs of different
   * status ever shared a run — they do not in the seed dataset — the later
   * entry in `payload.highlight` wins; this is not exercised by any test.
   */
  runStatus: Record<string, BudgetStatus>;
  /** Payload ids that name no NAP in `network` — ignored, never drawn at an invented position. */
  unknownIds: string[];
  /** Bounds to fit the view to, or `null` when `fit_bounds` is false or no entry is known. */
  bounds: LngLatBoundsTuple | null;
}

/**
 * Resolves `payload` into map state. `network` and `budgets` must be the same
 * pair the page loaded — `budgets` supplies each highlighted NAP's path
 * (`hops[].run_id`) without re-walking the tree.
 */
export function resolveHighlight(
  payload: HighlightPayload,
  network: Network,
  budgets: BudgetResult[],
): ResolvedHighlight {
  const knownNapIds = new Set(network.splitters.map((nap) => nap.id));
  const budgetByNapId = new Map(budgets.map((budget) => [budget.nap_id, budget]));

  const napStatus: Record<string, BudgetStatus> = {};
  const runStatus: Record<string, BudgetStatus> = {};
  const runIdSet = new Set<string>();
  const unknownIds: string[] = [];

  for (const entry of payload.highlight) {
    const budget = budgetByNapId.get(entry.nap_id);
    if (!knownNapIds.has(entry.nap_id) || budget === undefined) {
      unknownIds.push(entry.nap_id);
      continue;
    }

    napStatus[entry.nap_id] = entry.status;
    for (const hop of budget.hops) {
      runIdSet.add(hop.run_id);
      runStatus[hop.run_id] = entry.status;
    }
  }

  const highlightedNapIds = Object.keys(napStatus);
  const bounds =
    payload.fit_bounds && highlightedNapIds.length > 0
      ? computeBounds(network, highlightedNapIds, [...runIdSet])
      : null;

  return { napStatus, runIds: [...runIdSet], runStatus, unknownIds, bounds };
}

/** Bounds covering the OLT, the given NAPs, and every vertex of the given runs' geometry. */
function computeBounds(network: Network, napIds: string[], runIds: string[]): LngLatBoundsTuple {
  const napById = new Map(network.splitters.map((nap) => [nap.id, nap]));
  const runById = new Map(network.fiber_runs.map((run) => [run.id, run]));

  const points: Array<[number, number]> = [toLngLat(network.olt)];
  for (const napId of napIds) {
    const nap = napById.get(napId);
    if (nap !== undefined) points.push(toLngLat(nap));
  }
  for (const runId of runIds) {
    const run = runById.get(runId);
    if (run !== undefined) points.push(...run.geometry);
  }

  let west = points[0][0];
  let east = points[0][0];
  let south = points[0][1];
  let north = points[0][1];
  for (const [lon, lat] of points) {
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }

  return [
    [west, south],
    [east, north],
  ];
}
