/**
 * The GeoJSON the map draws for a point: the user's selected-point marker, and
 * what a feasibility answer adds (the evaluated point, the drop line, the rank
 * labels). Pure and DOM-free, so it is unit-tested without a browser.
 *
 * Nothing here chooses anything. The selected point is the one the user clicked.
 * The evaluated point, the line's end points and each rank come from the resolved
 * payload, which took them from a tool result: a position is looked up for a NAP
 * the payload names, and none is invented. See design.md (add-feasibility),
 * decision 8.
 *
 * The rank labels sit in this source rather than on the NAP layer because
 * MapLibre cannot drive a layout property, such as a label's text, from
 * feature-state: only paint properties can follow it.
 */

import { toLngLat } from "@/lib/map/geojson";
import type { ResolvedHighlight } from "@/lib/map/highlight";
import type { Network, Position } from "@/lib/network/types";

/** What one feature of the `feasibility` source is. */
export type FeasibilityFeatureKind = "point" | "drop" | "rank";

export interface FeasibilityProperties {
  kind: FeasibilityFeatureKind;
  /** The text of a rank label (`#1`); empty for the other kinds. */
  label: string;
}

export type FeasibilityGeoJson = GeoJSON.FeatureCollection<GeoJSON.Point | GeoJSON.LineString, FeasibilityProperties>;
export type SelectedPointGeoJson = GeoJSON.FeatureCollection<GeoJSON.Point, { id: string }>;

/** The marker of the point the user selected, or nothing. */
export function selectedPointToGeoJson(point: Position | null): SelectedPointGeoJson {
  return {
    type: "FeatureCollection",
    features:
      point === null
        ? []
        : [
            {
              type: "Feature",
              id: "selected-point",
              properties: { id: "selected-point" },
              geometry: { type: "Point", coordinates: toLngLat(point) },
            },
          ],
  };
}

/** The evaluated point, the drop line and one rank label per known candidate. */
export function feasibilityToGeoJson(
  resolved: Pick<ResolvedHighlight, "point" | "dropLine" | "candidateRank">,
  network: Network,
): FeasibilityGeoJson {
  const features: FeasibilityGeoJson["features"] = [];

  if (resolved.point !== null) {
    features.push({
      type: "Feature",
      properties: { kind: "point", label: "" },
      geometry: { type: "Point", coordinates: toLngLat(resolved.point) },
    });
  }
  if (resolved.dropLine !== null) {
    features.push({
      type: "Feature",
      properties: { kind: "drop", label: "" },
      geometry: { type: "LineString", coordinates: resolved.dropLine },
    });
  }
  const napById = new Map(network.splitters.map((nap) => [nap.id, nap]));
  for (const [napId, rank] of Object.entries(resolved.candidateRank)) {
    const nap = napById.get(napId);
    if (nap === undefined) continue;
    features.push({
      type: "Feature",
      properties: { kind: "rank", label: `#${rank}` },
      geometry: { type: "Point", coordinates: toLngLat(nap) },
    });
  }

  return { type: "FeatureCollection", features };
}
