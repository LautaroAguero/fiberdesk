/**
 * The two pure rules of point selection, kept out of the components so they are
 * tested without a browser (design.md (add-feasibility), decision 8).
 *
 * Selecting is a click on empty map space inside the modelled city. A click on a
 * NAP keeps opening its breakdown and never moves the point, and a click outside
 * the city selects nothing. Picking a new point retires a feasibility highlight,
 * so the candidates on screen never belong to a point other than the marker; a
 * highlight from any other tool is left alone.
 */

import type { HighlightPayload } from "@/lib/assistant/events";
import type { SelectedPoint } from "@/lib/assistant/map-context";
import { isInsideCity } from "@/lib/network/validate";

/**
 * The point a map click selects, or `null` when it selects nothing: the click
 * hit a NAP, or landed outside the modelled city.
 */
export function pointFromClick(position: { lat: number; lon: number }, hitNap: boolean): SelectedPoint | null {
  if (hitNap || !isInsideCity(position)) return null;
  return { lat: position.lat, lon: position.lon };
}

/**
 * True when selecting a new point must clear `payload`: it holds a `point`
 * entry, so it belongs to the old point. A payload from any other tool has none.
 */
export function clearsOnNewPoint(payload: HighlightPayload | null): boolean {
  return payload !== null && payload.highlight.some((entry) => entry.kind === "point");
}
