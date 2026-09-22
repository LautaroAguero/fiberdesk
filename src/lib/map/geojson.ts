/**
 * Converts the loaded network into the GeoJSON `FeatureCollection`s the map
 * layers consume. Pure and DOM-free — see design.md, decision 3 — so it is
 * unit-tested without a browser.
 *
 * Coordinate order: nodes carry named `lat`/`lon` fields (see
 * `src/lib/network/types.ts`), while GeoJSON and `FiberRun.geometry` both use
 * `[lon, lat]`. This module is the one place that conversion happens; nothing
 * downstream should need to know about it again.
 */

import type { Network, Position } from "@/lib/network/types";

/** `{ lat, lon }` to a GeoJSON `[lon, lat]` position. */
function toLngLat(node: Position): [number, number] {
  return [node.lon, node.lat];
}

/** Properties carried by the OLT feature. */
export interface OltProperties {
  id: string;
  name: string;
}

/** Properties carried by a NAP feature. */
export interface NapProperties {
  id: string;
  name: string;
  ratio: string;
  parent: string;
}

/** Properties carried by a fiber run feature. */
export interface FiberRunProperties {
  id: string;
  from: string;
  to: string;
}

/** Properties carried by a subscriber feature. */
export interface SubscriberProperties {
  id: string;
  name: string;
  nap: string;
}

/** The four layers the map draws, one `FeatureCollection` each. */
export interface NetworkGeoJson {
  olt: GeoJSON.FeatureCollection<GeoJSON.Point, OltProperties>;
  naps: GeoJSON.FeatureCollection<GeoJSON.Point, NapProperties>;
  runs: GeoJSON.FeatureCollection<GeoJSON.LineString, FiberRunProperties>;
  subscribers: GeoJSON.FeatureCollection<GeoJSON.Point, SubscriberProperties>;
}

/**
 * Builds the four `FeatureCollection`s the map draws from a loaded network.
 * Draws only what `network` contains — no invented positions, runs or
 * subscribers (spec: "The whole network is drawn on load").
 */
export function networkToGeoJson(network: Network): NetworkGeoJson {
  const olt: GeoJSON.FeatureCollection<GeoJSON.Point, OltProperties> = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: network.olt.id,
        properties: { id: network.olt.id, name: network.olt.name },
        geometry: { type: "Point", coordinates: toLngLat(network.olt) },
      },
    ],
  };

  const naps: GeoJSON.FeatureCollection<GeoJSON.Point, NapProperties> = {
    type: "FeatureCollection",
    features: network.splitters.map((nap) => ({
      type: "Feature",
      id: nap.id,
      properties: { id: nap.id, name: nap.name, ratio: nap.ratio, parent: nap.parent },
      geometry: { type: "Point", coordinates: toLngLat(nap) },
    })),
  };

  const runs: GeoJSON.FeatureCollection<GeoJSON.LineString, FiberRunProperties> = {
    type: "FeatureCollection",
    features: network.fiber_runs.map((run) => ({
      type: "Feature",
      id: run.id,
      properties: { id: run.id, from: run.from, to: run.to },
      geometry: { type: "LineString", coordinates: run.geometry },
    })),
  };

  const subscribers: GeoJSON.FeatureCollection<GeoJSON.Point, SubscriberProperties> = {
    type: "FeatureCollection",
    features: network.subscribers.map((subscriber) => ({
      type: "Feature",
      id: subscriber.id,
      properties: { id: subscriber.id, name: subscriber.name, nap: subscriber.nap },
      geometry: { type: "Point", coordinates: toLngLat(subscriber) },
    })),
  };

  return { olt, naps, runs, subscribers };
}
