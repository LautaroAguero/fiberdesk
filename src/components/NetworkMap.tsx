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
import type { ExpressionSpecification, GeoJSONSource, Map as MaplibreMap } from "maplibre-gl";

import {
  CANDIDATE_COLOR,
  CANDIDATE_RING_OPACITY,
  CANDIDATE_RING_WIDTH,
  CUT_COLOR,
  CUT_RUN_WIDTH,
  DARK_RUN_OPACITY,
  FALLBACK_STYLE,
  FIBER_COLOR,
  FIT_BOUNDS_MAX_ZOOM,
  FIT_BOUNDS_PADDING_PX,
  INITIAL_CENTER,
  INITIAL_ZOOM,
  MAPLIBRE_WORKER_URL,
  MAP_STYLE_URL,
  NEUTRAL_NAP_COLOR,
  OLT_COLOR,
  OUT_OF_SERVICE_COLOR,
  POINT_COLOR,
  STATUS_COLOR,
  SUBSCRIBER_COLOR,
} from "@/lib/map/config";
import {
  feasibilityToGeoJson,
  selectedPointToGeoJson,
  type FeasibilityGeoJson,
  type SelectedPointGeoJson,
} from "@/lib/map/feasibility-geojson";
import { networkToGeoJson, type NetworkGeoJson } from "@/lib/map/geojson";
import type { ResolvedHighlight } from "@/lib/map/highlight";
import { pointFromClick } from "@/lib/map/point";
import type { SelectedPoint } from "@/lib/assistant/map-context";
import type { Network } from "@/lib/network/types";

const LABEL_COLOR = "#27272a"; // Tailwind zinc-800 — legible on the light Positron base.
// A font OpenFreeMap serves; MapLibre's default ("Open Sans Regular") 404s there.
const LABEL_FONT = ["Noto Sans Regular"];

export interface NetworkMapProps {
  network: Network;
  /** The current turn's resolved highlight — see design.md, decision 6 for how the parent tracks it. */
  highlight: ResolvedHighlight;
  /** Called with a NAP's id when the user clicks it — any NAP, highlighted or not (spec: "Clicking a NAP shows its optical budget"). */
  onSelectNap: (napId: string) => void;
  /** Called with the clicked location when a click lands on empty space inside the city (add-feasibility, decision 8). */
  onSelectPoint: (point: SelectedPoint) => void;
  /** The point the user selected, drawn as a marker; `null` when none (add-feasibility, decision 8). */
  selectedPoint: SelectedPoint | null;
}

/**
 * A paint expression that reads `featureStateKey` (a `HighlightStatus` string,
 * or unset) off feature state and resolves it to that status's colour,
 * falling back to `fallback` when unset. Shared between the NAP and subscriber
 * layers (`status`) and the run layer (`onPath`): the colour of each is the
 * status its payload entry carries, a budget classification or a cut.
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
    "out_of_service",
    OUT_OF_SERVICE_COLOR,
    "cut",
    CUT_COLOR,
    fallback,
  ];
}

/**
 * Line width of a run: the cut run widest, a run on a path or a dark run medium, the rest thin.
 * A dark run is drawn as wide as a path: at the neutral width its slate would read as just
 * another grey run (verified in the browser, add-cut-impact task 2.3).
 */
const RUN_WIDTH_EXPRESSION: ExpressionSpecification = [
  "case",
  ["==", ["feature-state", "onPath"], "cut"],
  CUT_RUN_WIDTH,
  ["!=", ["feature-state", "onPath"], null],
  4,
  2,
];

/** Opacity of a run: a dark run is slightly faded, so the subtree reads as switched off. */
const RUN_OPACITY_EXPRESSION: ExpressionSpecification = [
  "case",
  ["==", ["feature-state", "onPath"], "out_of_service"],
  DARK_RUN_OPACITY,
  1,
];

/** Picks the entry of `table` for a candidate's feasibility (feature-state `candidate`), else `fallback`. */
function candidateExpression(
  table: Record<"feasible" | "marginal" | "not_feasible", string | number>,
  fallback: string | number,
): ExpressionSpecification {
  return [
    "match",
    ["feature-state", "candidate"],
    "feasible",
    table.feasible,
    "marginal",
    table.marginal,
    "not_feasible",
    table.not_feasible,
    fallback,
  ];
}

/**
 * The ring around a NAP. A cut NAP keeps its translucent magenta ring; otherwise a candidate
 * gets a ring by feasibility, and any other NAP none. The ring never touches the fill, which
 * stays the NAP's own status colour.
 */
const NAP_STROKE_COLOR: ExpressionSpecification = [
  "case",
  ["==", ["feature-state", "status"], "cut"],
  CUT_COLOR,
  candidateExpression(CANDIDATE_COLOR, CUT_COLOR),
];
const NAP_STROKE_WIDTH: ExpressionSpecification = [
  "case",
  ["==", ["feature-state", "status"], "cut"],
  4,
  candidateExpression(CANDIDATE_RING_WIDTH, 0),
];
const NAP_STROKE_OPACITY: ExpressionSpecification = [
  "case",
  ["==", ["feature-state", "status"], "cut"],
  0.35,
  candidateExpression(CANDIDATE_RING_OPACITY, 0.35),
];

/**
 * Adds the four network sources and their layers to `map`'s *current* style.
 * Called on every `style.load` — the initial one, and again if the base
 * style fails and `handleStyleError` swaps in the fallback background, since
 * a style swap discards whatever sources and layers the previous style had.
 */
function addNetworkOverlay(
  map: MaplibreMap,
  geojson: NetworkGeoJson,
  selectedPoint: SelectedPointGeoJson,
  feasibility: FeasibilityGeoJson,
): void {
  map.addSource("runs", { type: "geojson", data: geojson.runs, promoteId: "id" });
  map.addSource("subscribers", { type: "geojson", data: geojson.subscribers, promoteId: "id" });
  map.addSource("naps", { type: "geojson", data: geojson.naps, promoteId: "id" });
  map.addSource("olt", { type: "geojson", data: geojson.olt, promoteId: "id" });
  map.addSource("selected-point", { type: "geojson", data: selectedPoint });
  map.addSource("feasibility", { type: "geojson", data: feasibility });

  map.addLayer({
    id: "runs-line",
    type: "line",
    source: "runs",
    paint: {
      "line-color": statusColorExpression("onPath", FIBER_COLOR),
      "line-width": RUN_WIDTH_EXPRESSION,
      "line-opacity": RUN_OPACITY_EXPRESSION,
    },
  });

  // The drop line from the evaluated point to the best candidate, under the NAPs.
  map.addLayer({
    id: "feasibility-drop",
    type: "line",
    source: "feasibility",
    filter: ["==", ["get", "kind"], "drop"],
    paint: { "line-color": POINT_COLOR, "line-width": 3, "line-dasharray": [2, 2] },
  });

  map.addLayer({
    id: "subscribers-circle",
    type: "circle",
    source: "subscribers",
    paint: {
      // A traced subscriber takes its status colour and grows, like a NAP does.
      "circle-radius": ["case", ["!=", ["feature-state", "status"], null], 6, 2.5],
      "circle-color": statusColorExpression("status", SUBSCRIBER_COLOR),
    },
  });

  map.addLayer({
    id: "naps-circle",
    type: "circle",
    source: "naps",
    paint: {
      "circle-radius": 7,
      "circle-color": statusColorExpression("status", NEUTRAL_NAP_COLOR),
      // A cut NAP gets a translucent ring in the cut colour, on top of its fill; a
      // connection candidate gets a ring by feasibility. Both are rings, so the fill
      // stays the NAP's own status.
      "circle-stroke-color": NAP_STROKE_COLOR,
      "circle-stroke-width": NAP_STROKE_WIDTH,
      "circle-stroke-opacity": NAP_STROKE_OPACITY,
    },
  });
  map.addLayer({
    id: "naps-label",
    type: "symbol",
    source: "naps",
    layout: {
      "text-field": ["get", "id"],
      "text-font": LABEL_FONT,
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
      "text-font": LABEL_FONT,
      "text-size": 12,
      "text-offset": [0, 1.4],
      "text-anchor": "top",
    },
    paint: { "text-color": LABEL_COLOR },
  });

  // On top of everything: the evaluated point, the candidates' rank labels, and the
  // user's own marker (a hollow ring, so the evaluated dot shows inside it).
  map.addLayer({
    id: "feasibility-point",
    type: "circle",
    source: "feasibility",
    filter: ["==", ["get", "kind"], "point"],
    paint: {
      "circle-radius": 4,
      "circle-color": POINT_COLOR,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.5,
    },
  });
  map.addLayer({
    id: "feasibility-rank",
    type: "symbol",
    source: "feasibility",
    filter: ["==", ["get", "kind"], "rank"],
    layout: {
      "text-field": ["get", "label"],
      "text-font": LABEL_FONT,
      "text-size": 13,
      "text-offset": [0, -1.3],
      "text-anchor": "bottom",
      "text-allow-overlap": true,
    },
    paint: { "text-color": LABEL_COLOR, "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
  });
  map.addLayer({
    id: "selected-point-circle",
    type: "circle",
    source: "selected-point",
    paint: {
      "circle-radius": 9,
      "circle-color": POINT_COLOR,
      "circle-opacity": 0,
      "circle-stroke-color": POINT_COLOR,
      "circle-stroke-width": 3,
    },
  });
}

export default function NetworkMap({
  network,
  highlight,
  onSelectNap,
  onSelectPoint,
  selectedPoint,
}: NetworkMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  // Flips once the sources/layers exist, so the highlight effect below knows
  // it is safe to call setFeatureState. Toggling it again on every style
  // reload (including a fallback swap) is intentional, not just the first one.
  const [isReady, setIsReady] = useState(false);
  // True until the view is deliberately moved; see the "resize" handler below.
  const keepInitialViewRef = useRef(true);
  // A ref, not a `useEffect` dependency: the click handler is bound once,
  // below, and should always call whichever `onSelectNap` the latest render
  // passed without needing to rebind the map listener for it.
  const onSelectNapRef = useRef(onSelectNap);
  useEffect(() => {
    onSelectNapRef.current = onSelectNap;
  }, [onSelectNap]);
  const onSelectPointRef = useRef(onSelectPoint);
  useEffect(() => {
    onSelectPointRef.current = onSelectPoint;
  }, [onSelectPoint]);
  // The latest data of the two point sources. A style swap (the fallback) discards
  // the sources, and the overlay is re-added from these rather than left empty.
  const selectedPointDataRef = useRef<SelectedPointGeoJson>(selectedPointToGeoJson(null));
  const feasibilityDataRef = useRef<FeasibilityGeoJson>(feasibilityToGeoJson(highlight, network));

  useEffect(() => {
    if (mapRef.current !== null || containerRef.current === null) return;

    let cancelled = false;

    void (async () => {
      const { Map, LngLatBounds, setWorkerUrl } = await import("maplibre-gl");
      if (cancelled || containerRef.current === null) return;

      setWorkerUrl(MAPLIBRE_WORKER_URL);

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

      // A click on empty space selects a point. The NAP handler above has already run
      // for a click on a NAP, and that click must not also move the point, so this one
      // asks the map whether a NAP is under the cursor. The rule itself is
      // `pointFromClick`, tested apart from the browser.
      map.on("click", (mouseEvent) => {
        const hitNap =
          map.getLayer("naps-circle") !== undefined &&
          map.queryRenderedFeatures(mouseEvent.point, { layers: ["naps-circle"] }).length > 0;
        const point = pointFromClick({ lat: mouseEvent.lngLat.lat, lon: mouseEvent.lngLat.lng }, hitNap);
        if (point !== null) onSelectPointRef.current(point);
      });

      // Spec: "The base map is unavailable" — if the OpenFreeMap style never
      // loads, fall back to a plain background rather than an empty map.
      // Keyed on the style having loaded, not on `isStyleLoaded()`: that one
      // is also false while tiles or glyphs are still in flight, so a single
      // 404'd tile would otherwise throw away a perfectly good base map.
      let styleSettled = false; // a style (base or fallback) has loaded, or the fallback is on its way
      map.on("error", () => {
        if (styleSettled) return;
        styleSettled = true;
        map.setStyle(FALLBACK_STYLE as unknown as string);
      });

      // Initial view: the OLT and every NAP (spec: "The seed network appears").
      const initialBounds = new LngLatBounds();
      initialBounds.extend(geojson.olt.features[0].geometry.coordinates as [number, number]);
      for (const feature of geojson.naps.features) {
        initialBounds.extend(feature.geometry.coordinates as [number, number]);
      }
      const fitInitialView = () => {
        map.fitBounds(initialBounds, { padding: FIT_BOUNDS_PADDING_PX, animate: false });
      };

      // A map created in a hidden tab gets a 0×0 container, and a later resize
      // keeps that zoom rather than the bounds. So the initial fit is re-applied
      // on every resize until the view has been deliberately moved — by the
      // user, or by a highlight reframing it.
      map.on("resize", () => {
        if (keepInitialViewRef.current) fitInitialView();
      });
      map.on("movestart", (moveEvent) => {
        if (moveEvent.originalEvent !== undefined) keepInitialViewRef.current = false;
      });

      let overlayAdded = false;
      map.on("style.load", () => {
        styleSettled = true;
        addNetworkOverlay(map, geojson, selectedPointDataRef.current, feasibilityDataRef.current);

        if (!overlayAdded) {
          overlayAdded = true;
          fitInitialView();
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
  const previousHighlightRef = useRef<{ napIds: string[]; subscriberIds: string[]; runIds: string[] }>({
    napIds: [],
    subscriberIds: [],
    runIds: [],
  });
  useEffect(() => {
    const map = mapRef.current;
    if (!isReady || map === null) return;

    const previous = previousHighlightRef.current;
    for (const napId of previous.napIds) {
      map.removeFeatureState({ source: "naps", id: napId });
    }
    for (const subscriberId of previous.subscriberIds) {
      map.removeFeatureState({ source: "subscribers", id: subscriberId });
    }
    for (const runId of previous.runIds) {
      map.removeFeatureState({ source: "runs", id: runId });
    }

    // A NAP can carry both a status (its own entry) and a candidate feasibility.
    const napIds = [...new Set([...Object.keys(highlight.napStatus), ...Object.keys(highlight.candidateFeasibility)])];
    for (const napId of napIds) {
      const state: Record<string, string> = {};
      if (highlight.napStatus[napId] !== undefined) state.status = highlight.napStatus[napId];
      if (highlight.candidateFeasibility[napId] !== undefined) state.candidate = highlight.candidateFeasibility[napId];
      map.setFeatureState({ source: "naps", id: napId }, state);
    }
    for (const [subscriberId, status] of Object.entries(highlight.subscriberStatus)) {
      map.setFeatureState({ source: "subscribers", id: subscriberId }, { status });
    }
    for (const runId of highlight.runIds) {
      map.setFeatureState({ source: "runs", id: runId }, { onPath: highlight.runStatus[runId] });
    }

    previousHighlightRef.current = {
      napIds,
      subscriberIds: Object.keys(highlight.subscriberStatus),
      runIds: highlight.runIds,
    };

    if (highlight.bounds !== null) {
      keepInitialViewRef.current = false;
      map.fitBounds(highlight.bounds, { padding: FIT_BOUNDS_PADDING_PX, maxZoom: FIT_BOUNDS_MAX_ZOOM });
    }
  }, [highlight, isReady]);

  // The evaluated point, the drop line and the rank labels follow the highlight; the
  // user's marker follows the selected point. Data goes through `setData`, not
  // feature-state, since both are a handful of features that come and go.
  useEffect(() => {
    feasibilityDataRef.current = feasibilityToGeoJson(highlight, network);
    const source = mapRef.current?.getSource<GeoJSONSource>("feasibility");
    if (isReady && source !== undefined) source.setData(feasibilityDataRef.current);
  }, [highlight, network, isReady]);

  useEffect(() => {
    selectedPointDataRef.current = selectedPointToGeoJson(selectedPoint);
    const source = mapRef.current?.getSource<GeoJSONSource>("selected-point");
    if (isReady && source !== undefined) source.setData(selectedPointDataRef.current);
  }, [selectedPoint, isReady]);

  return <div ref={containerRef} className="h-full w-full" />;
}
