/**
 * Great-circle distance between two points on the Earth's surface.
 *
 * Geometry, not optics: this lives beside neither the optical constants nor
 * the engine. The haversine formula is used because it is the standard one and
 * stays accurate at any distance, which later changes (feasibility) will need,
 * even though a drop spans a few hundred metres. See design.md
 * (add-subscriber-trace), decision 3.
 */

import type { Position } from "@/lib/network/types";

/**
 * Mean Earth radius, in kilometres.
 *
 * Source: IUGG mean radius R1 = (2a + b) / 3 for the WGS 84 ellipsoid,
 * 6,371.0088 km.
 */
export const EARTH_RADIUS_KM = 6371.0088;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Straight-line distance between two positions, in kilometres, unrounded. */
export function haversineKm(a: Position, b: Position): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
