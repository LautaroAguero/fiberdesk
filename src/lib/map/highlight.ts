/**
 * Resolves a turn's `HighlightPayload` against the loaded network into exactly
 * what the map needs to paint: which NAPs and subscribers get which status
 * colour, which fiber runs are marked and in what colour, which payload ids
 * name nothing the map knows, and the bounds to fit the view to.
 *
 * Pure and DOM-free — see design.md (add-map-copilot), decision 3. The payload
 * states everything to paint (add-subscriber-trace, decisions 7 and 8): the
 * runs are entries of their own, so this module derives no path and walks no
 * tree. The status shown is always the payload's own; the map colours only what
 * the payload names and reclassifies nothing. The one thing it decides is the
 * colour of an element that two entries mark differently: the more severe
 * status wins, an outage over any classification (add-cut-impact, decision 5).
 * A cut run is bounded like any other run, so a reframe on a cut contains it.
 *
 * A connection-feasibility answer adds a point and candidates (add-feasibility,
 * decision 8). The candidates are told apart from the NAP statuses: they have a
 * feasibility and a rank, never a budget status, so a NAP's own entry keeps its
 * fill. The drop line runs from the payload's point to the NAP the payload names
 * as best: this module looks up a position and never picks a NAP.
 */

import { toLngLat } from "@/lib/map/geojson";
import type { CandidateFeasibility, HighlightPayload } from "@/lib/assistant/events";
import { worseStatus, type HighlightStatus } from "@/lib/optical/status";
import type { Network } from "@/lib/network/types";

/** A LngLat bounding box as MapLibre's `fitBounds` expects it: `[[west, south], [east, north]]`. */
export type LngLatBoundsTuple = [[number, number], [number, number]];

export interface ResolvedHighlight {
  /** Status to paint each known, highlighted NAP with, keyed by its id. */
  napStatus: Record<string, HighlightStatus>;
  /** Status to paint each known, highlighted subscriber with, keyed by its id. */
  subscriberStatus: Record<string, HighlightStatus>;
  /**
   * Status to paint each known, listed run with, keyed by run id. When two
   * entries mark the same run with different statuses, the worse one.
   */
  runStatus: Record<string, HighlightStatus>;
  /** Ids of every known, listed fiber run (the keys of `runStatus`). */
  runIds: string[];
  /** Payload ids that name no NAP, subscriber or run in `network`: ignored, never drawn at an invented position. */
  unknownIds: string[];
  /** Feasibility of each known candidate NAP, keyed by its id. */
  candidateFeasibility: Record<string, CandidateFeasibility>;
  /** Rank (from 1) of each known candidate NAP, keyed by its id. */
  candidateRank: Record<string, number>;
  /** The evaluated point as the payload gave it, or `null` when the payload has none. */
  point: { lat: number; lon: number } | null;
  /**
   * `[from, to]` as `[lon, lat]` pairs: the point to the best candidate's NAP.
   * `null` when there is no point, no best candidate, or the NAP is unknown.
   */
  dropLine: [[number, number], [number, number]] | null;
  /**
   * Bounds to fit the view to, or `null` when `fit_bounds` is false or no NAP,
   * subscriber, point or candidate entry is known.
   */
  bounds: LngLatBoundsTuple | null;
}

/** Resolves `payload` into map state. `network` must be the one the page loaded. */
export function resolveHighlight(payload: HighlightPayload, network: Network): ResolvedHighlight {
  const napById = new Map(network.splitters.map((nap) => [nap.id, nap]));
  const subscriberById = new Map(network.subscribers.map((subscriber) => [subscriber.id, subscriber]));
  const runById = new Map(network.fiber_runs.map((run) => [run.id, run]));

  const napStatus: Record<string, HighlightStatus> = {};
  const subscriberStatus: Record<string, HighlightStatus> = {};
  const runStatus: Record<string, HighlightStatus> = {};
  const candidateFeasibility: Record<string, CandidateFeasibility> = {};
  const candidateRank: Record<string, number> = {};
  let point: ResolvedHighlight["point"] = null;
  let bestNapId: string | null = null;
  const unknownIds: string[] = [];

  // Two entries naming one element keep the more severe status, in the shared
  // order (`cut`, `out_of_service`, `fail`, `marginal`, `pass`).
  const merge = (statuses: Record<string, HighlightStatus>, id: string, status: HighlightStatus) => {
    const existing = statuses[id];
    statuses[id] = existing === undefined ? status : worseStatus(existing, status);
  };

  for (const entry of payload.highlight) {
    switch (entry.kind) {
      case "nap":
        if (napById.has(entry.id)) merge(napStatus, entry.id, entry.status);
        else unknownIds.push(entry.id);
        break;
      case "subscriber":
        if (subscriberById.has(entry.id)) merge(subscriberStatus, entry.id, entry.status);
        else unknownIds.push(entry.id);
        break;
      case "run":
        if (runById.has(entry.id)) merge(runStatus, entry.id, entry.status);
        else unknownIds.push(entry.id);
        break;
      case "candidate":
        if (napById.has(entry.id)) {
          candidateFeasibility[entry.id] = entry.feasibility;
          candidateRank[entry.id] = entry.rank;
        } else unknownIds.push(entry.id);
        break;
      case "point":
        point = { lat: entry.lat, lon: entry.lon };
        bestNapId = entry.best_nap_id;
        break;
    }
  }

  const points: Array<[number, number]> = [];
  for (const id of Object.keys(napStatus)) points.push(toLngLat(napById.get(id)!));
  for (const id of Object.keys(subscriberStatus)) points.push(toLngLat(subscriberById.get(id)!));
  for (const id of Object.keys(candidateFeasibility)) points.push(toLngLat(napById.get(id)!));
  if (point !== null) points.push(toLngLat(point));
  const hasSubject = points.length > 0;
  for (const id of Object.keys(runStatus)) points.push(...runById.get(id)!.geometry);

  return {
    napStatus,
    subscriberStatus,
    runStatus,
    runIds: Object.keys(runStatus),
    unknownIds,
    candidateFeasibility,
    candidateRank,
    point,
    dropLine: dropLineOf(point, bestNapId, napById),
    bounds: payload.fit_bounds && hasSubject ? computeBounds([toLngLat(network.olt), ...points]) : null,
  };
}

/** The drop line from the point to the best candidate's NAP, or `null` when any part is missing. */
function dropLineOf(
  point: ResolvedHighlight["point"],
  bestNapId: string | null,
  napById: Map<string, Network["splitters"][number]>,
): ResolvedHighlight["dropLine"] {
  const nap = bestNapId === null ? undefined : napById.get(bestNapId);
  if (point === null || nap === undefined) return null;
  return [toLngLat(point), toLngLat(nap)];
}

/** The bounding box of `points`, given at least one. */
function computeBounds(points: Array<[number, number]>): LngLatBoundsTuple {
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
