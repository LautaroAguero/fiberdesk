/**
 * The state of the map a chat request carries alongside the conversation.
 *
 * Today that is one optional selected point. It reaches the model only through
 * the result of a tool that reads it — never through the system prompt or the
 * messages — so the cached prefix is identical for every point and the history
 * the client resends carries no stale marker. See design.md (add-feasibility),
 * decision 5.
 */

import { isInsideCity } from "@/lib/network/validate";

export interface SelectedPoint {
  lat: number;
  lon: number;
}

export interface MapContext {
  selected_point?: SelectedPoint;
}

export type ParseMapContextResult = { ok: true; mapContext: MapContext } | { ok: false; error: string };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Reads `map_context` from a chat request body. An absent field (an older
 * client) is a context with no point. Anything malformed, or a point outside the
 * modelled city, is refused with a message naming the problem — the route turns
 * it into a 400 before any model call.
 */
export function parseMapContext(body: unknown): ParseMapContextResult {
  const raw = isObject(body) ? body.map_context : undefined;
  if (raw === undefined || raw === null) return { ok: true, mapContext: {} };
  if (!isObject(raw)) return { ok: false, error: "`map_context` must be an object." };

  const point = raw.selected_point;
  if (point === undefined || point === null) return { ok: true, mapContext: {} };
  if (!isObject(point)) {
    return { ok: false, error: "`map_context.selected_point` must be an object with `lat` and `lon`." };
  }

  const { lat, lon } = point;
  if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { ok: false, error: "`map_context.selected_point` must have finite numeric `lat` and `lon`." };
  }
  if (!isInsideCity({ lat, lon })) {
    return { ok: false, error: `The selected point (${lat}, ${lon}) is outside the modelled city.` };
  }
  return { ok: true, mapContext: { selected_point: { lat, lon } } };
}
