/**
 * Static configuration for the network map: the base style, the fallback
 * background when it cannot be reached, the initial view, and the colour
 * table the map and the breakdown panel both paint from.
 *
 * See design.md, decisions 2 and 5. Every value here is a rendering choice,
 * not a network or optical figure — those come from `seed/network.json` and
 * `src/lib/optical/constants.ts` respectively, never from this file.
 */

import type { BudgetStatus } from "@/lib/optical/budget";

/**
 * OpenFreeMap's hosted "positron" style: light, low-contrast, so the network
 * overlay stays legible on top of it. No API key or account — see
 * proposal.md, "Base map tiles from OpenFreeMap".
 */
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

/**
 * Where MapLibre loads its web worker from. Turbopack does not emit the
 * worker MapLibre resolves relative to its own bundle, so
 * `scripts/copy-maplibre-worker.mjs` copies it here before `dev` and `build`.
 */
export const MAPLIBRE_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";

/**
 * Used when the style above fails to load (spec: "The base map is
 * unavailable"). A single background layer, no tile source, so the network
 * overlay still renders on a plain surface instead of a blank error state.
 */
export const FALLBACK_STYLE = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "fallback-background",
      type: "background",
      paint: { "background-color": "#f4f4f5" },
    },
  ],
} as const;

/** The OLT's position, `[lon, lat]` — the map's initial center. */
export const INITIAL_CENTER: [number, number] = [-58.9866, -27.4512];

/** Initial zoom: wide enough that every NAP in the seed network is in view. */
export const INITIAL_ZOOM = 11;

/**
 * Padding, in pixels, applied on every `fitBounds` call. Large enough that a
 * marker at the edge keeps its label below it and clears the "Clear
 * highlight" button in the top-left corner.
 */
export const FIT_BOUNDS_PADDING_PX = 72;

/**
 * Closest zoom a highlight may reframe to. A single NAP near the OLT has a tiny
 * bounding box; without a cap the view dives to street level and loses context.
 */
export const FIT_BOUNDS_MAX_ZOOM = 14;

/**
 * Colour for each budget classification, reused by the map's highlight layer
 * and the breakdown panel's status badge, so the two never disagree visually.
 * Tailwind palette, per design.md decision 2.
 */
export const STATUS_COLOR: Record<BudgetStatus, string> = {
  pass: "#10b981", // emerald-500
  marginal: "#f59e0b", // amber-500
  fail: "#dc2626", // red-600
};

/** Colour for a NAP not named in the current highlight. Tailwind slate-400. */
export const NEUTRAL_NAP_COLOR = "#94a3b8";

/** Colour for the OLT marker. Tailwind indigo-600. */
export const OLT_COLOR = "#4f46e5";

/** Colour for a subscriber marker. Tailwind slate-300. */
export const SUBSCRIBER_COLOR = "#cbd5e1";

/** Colour for a fiber run not on a highlighted path. Tailwind slate-500. */
export const FIBER_COLOR = "#64748b";
