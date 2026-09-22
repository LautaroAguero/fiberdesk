"use client";

/**
 * Owns the MapLibre GL instance: creates the map once, adds the whole
 * network as four GeoJSON sources and their layers, and (from task 4.3 on)
 * repaints the resolved highlight through `setFeatureState` rather than
 * re-adding layers per turn. See design.md, decision 5.
 *
 * MapLibre touches `window` and WebGL, neither of which exist during SSR, so
 * the library is imported dynamically inside the effect — nothing at module
 * scope references it.
 */

import { useEffect, useRef, useState } from "react";
import type { ExpressionSpecification, Map as MaplibreMap } from "maplibre-gl";

import {
  FALLBACK_STYLE,
  FIBER_COLOR,
  FIT_BOUNDS_PADDING_PX,
  INITIAL_CENTER,
  INITIAL_ZOOM,
  MAP_STYLE_URL,
  NEUTRAL_NAP_COLOR,
  OLT_COLOR,
  STATUS_COLOR,
  SUBSCRIBER_COLOR,
} from "@/lib/map/config";
import { networkToGeoJson, type NetworkGeoJson } from "@/lib/map/geojson";
import type { ResolvedHighlight } from "@/lib/map/highlight";
import type { Network } from "@/lib/network/types";

const LABEL_COLOR = "#27272a"; // Tailwind zinc-800 — legible on the light Positron base.

export interface NetworkMapProps {
  network: Network;
  /** The current turn's resolved highlight — see design.md, decision 6 for how the parent tracks it. */
  highlight: ResolvedHighlight;
  /** Called with a NAP's id when the user clicks it — any NAP, highlighted or not (spec: "Clicking a NAP shows its optical budget"). */
  onSelectNap: (napId: string) => void;
}

/**
 * A paint expression that reads `featureStateKey` (a `BudgetStatus` string,
 * or unset) off feature state and resolves it to that status's colour,
 * falling back to `fallback` when unset. Shared between the NAP layer
 * (`status`) and the run layer (`onPath`) — see design.md, decision 2: "the
 * highlighted path takes its NAP's status colour".
 */
function statusColorExpression(featureStateKey: "status" | "onPath", fallback: string): ExpressionSpecification {
  return [
    "match",
    ["feature-state", featureStateKey],
    "pass",
    STATUS_COLOR.pass,
    "marginal",
    STATUS_COLOR.marginal,
    "fail",
    STATUS_COLOR.fail,
    fallback,
  ];
}

/**
 * Adds the four network sources and their layers to `map`'s *current* style.
 * Called on every `style.load` — the initial one, and again if the base
 * style fails and `handleStyleError` swaps in the fallback background, since
 * a style swap discards whatever sources and layers the previous style had.
 */
function addNetworkOverlay(map: MaplibreMap, geojson: NetworkGeoJson): void {
  map.addSource("runs", { type: "geojson", data: geojson.runs, promoteId: "id" });
  map.addSource("subscribers", { type: "geojson", data: geojson.subscribers, promoteId: "id" });
  map.addSource("naps", { type: "geojson", data: geojson.naps, promoteId: "id" });
  map.addSource("olt", { type: "geojson", data: geojson.olt, promoteId: "id" });

  map.addLayer({
    id: "runs-line",
    type: "line",
    source: "runs",
    paint: {
      "line-color": statusColorExpression("onPath", FIBER_COLOR),
      "line-width": ["case", ["!=", ["feature-state", "onPath"], null], 4, 2],
    },
  });

  map.addLayer({
    id: "subscribers-circle",
    type: "circle",
    source: "subscribers",
    paint: { "circle-radius": 2.5, "circle-color": SUBSCRIBER_COLOR },
  });

  map.addLayer({
    id: "naps-circle",
    type: "circle",
    source: "naps",
    paint: { "circle-radius": 7, "circle-color": statusColorExpression("status", NEUTRAL_NAP_COLOR) },
  });
  map.addLayer({
    id: "naps-label",
    type: "symbol",
    source: "naps",
    layout: {
      "text-field": ["get", "id"],
      "text-size": 11,
      "text-offset": [0, 1.2],
      "text-anchor": "top",
    },
    paint: { "text-color": LABEL_COLOR },
  });

  map.addLayer({
    id: "olt-circle",
    type: "circle",
    source: "olt",
    paint: { "circle-radius": 10, "circle-color": OLT_COLOR },
  });
  map.addLayer({
    id: "olt-label",
    type: "symbol",
    source: "olt",
    layout: {
      "text-field": ["get", "id"],
      "text-size": 12,
      "text-offset": [0, 1.4],
      "text-anchor": "top",
    },
    paint: { "text-color": LABEL_COLOR },
  });
}

export default function NetworkMap({ network, highlight, onSelectNap }: NetworkMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  // Flips once the sources/layers exist, so the highlight effect below knows
  // it is safe to call setFeatureState. Toggling it again on every style
  // reload (including a fallback swap) is intentional, not just the first one.
  const [isReady, setIsReady] = useState(false);
  // A ref, not a `useEffect` dependency: the click handler is bound once,
  // below, and should always call whichever `onSelectNap` the latest render
  // passed without needing to rebind the map listener for it.
  const onSelectNapRef = useRef(onSelectNap);
  useEffect(() => {
    onSelectNapRef.current = onSelectNap;
  }, [onSelectNap]);

  useEffect(() => {
    if (mapRef.current !== null || containerRef.current === null) return;

    let cancelled = false;

    void (async () => {
      const { Map, LngLatBounds } = await import("maplibre-gl");
      if (cancelled || containerRef.current === null) return;

      const geojson = networkToGeoJson(network);

      const map = new Map({
        container: containerRef.current,
        style: MAP_STYLE_URL,
        center: INITIAL_CENTER,
        zoom: INITIAL_ZOOM,
      });
      mapRef.current = map;

      // Any NAP is clickable, highlighted or not (spec: "Clicking a NAP shows
      // its optical budget"). Bound once here rather than inside style.load,
      // so a fallback style swap does not register a second listener.
      map.on("mouseenter", "naps-circle", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "naps-circle", () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("click", "naps-circle", (mouseEvent) => {
        const napId = mouseEvent.features?.[0]?.properties?.id as string | undefined;
        if (napId !== undefined) onSelectNapRef.current(napId);
      });

      // Spec: "The base map is unavailable" — if the OpenFreeMap style never
      // loads, fall back to a plain background rather than an empty map.
      // Guarded so a later, unrelated runtime error (e.g. a missing tile)
      // cannot re-trigger it once the style has already loaded once.
      let fellBack = false;
      map.on("error", () => {
        if (fellBack || map.isStyleLoaded()) return;
        fellBack = true;
        map.setStyle(FALLBACK_STYLE as unknown as string);
      });

      let initialViewSet = false;
      map.on("style.load", () => {
        addNetworkOverlay(map, geojson);

        if (!initialViewSet) {
          initialViewSet = true;
          // Initial view: the OLT and every NAP (spec: "The seed network appears").
          const bounds = new LngLatBounds();
          bounds.extend(geojson.olt.features[0].geometry.coordinates as [number, number]);
          for (const feature of geojson.naps.features) {
            bounds.extend(feature.geometry.coordinates as [number, number]);
          }
          map.fitBounds(bounds, { padding: FIT_BOUNDS_PADDING_PX, animate: false });
        }

        setIsReady(true);
      });
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [network]);

  // Applies the resolved highlight through setFeatureState — see design.md,
  // decision 5: no layer is ever re-added for a turn, only paint state.
  const previousHighlightRef = useRef<{ napIds: string[]; runIds: string[] }>({ napIds: [], runIds: [] });
  useEffect(() => {
    const map = mapRef.current;
    if (!isReady || map === null) return;

    const previous = previousHighlightRef.current;
    for (const napId of previous.napIds) {
      map.removeFeatureState({ source: "naps", id: napId });
    }
    for (const runId of previous.runIds) {
      map.removeFeatureState({ source: "runs", id: runId });
    }

    for (const [napId, status] of Object.entries(highlight.napStatus)) {
      map.setFeatureState({ source: "naps", id: napId }, { status });
    }
    for (const runId of highlight.runIds) {
      map.setFeatureState({ source: "runs", id: runId }, { onPath: highlight.runStatus[runId] });
    }

    previousHighlightRef.current = { napIds: Object.keys(highlight.napStatus), runIds: highlight.runIds };

    if (highlight.bounds !== null) {
      map.fitBounds(highlight.bounds, { padding: FIT_BOUNDS_PADDING_PX });
    }
  }, [highlight, isReady]);

  return <div ref={containerRef} className="h-full w-full" />;
}
