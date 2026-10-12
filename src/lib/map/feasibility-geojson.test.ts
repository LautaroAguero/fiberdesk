import { describe, expect, test } from "vitest";

import type { HighlightPayload } from "@/lib/assistant/events";
import { feasibilityToGeoJson, selectedPointToGeoJson } from "@/lib/map/feasibility-geojson";
import { resolveHighlight } from "@/lib/map/highlight";
import { loadNetwork } from "@/lib/network/load";

const network = loadNetwork();

const E_PAYLOAD: HighlightPayload = {
  highlight: [
    { kind: "point", id: "selected-point", lat: -27.4659, lon: -58.97, best_nap_id: "NAP-11" },
    { kind: "candidate", id: "NAP-11", rank: 1, feasibility: "feasible" },
    { kind: "candidate", id: "NAP-05", rank: 2, feasibility: "feasible" },
    { kind: "candidate", id: "NAP-04", rank: 3, feasibility: "not_feasible" },
  ],
  fit_bounds: true,
};

describe("4.3 the GeoJSON of the selected point and of a feasibility answer", () => {
  test("no selected point is an empty collection; a point is a [lon, lat] feature", () => {
    expect(selectedPointToGeoJson(null).features).toEqual([]);
    expect(selectedPointToGeoJson({ lat: -27.4659, lon: -58.97 }).features[0].geometry.coordinates).toEqual([
      -58.97, -27.4659,
    ]);
  });

  test("point E: the evaluated point, a drop line to NAP-11 and three rank labels", () => {
    const geojson = feasibilityToGeoJson(resolveHighlight(E_PAYLOAD, network), network);
    const nap11 = network.splitters.find((n) => n.id === "NAP-11")!;

    const byKind = (kind: string) => geojson.features.filter((f) => f.properties.kind === kind);
    expect(byKind("point")).toHaveLength(1);
    expect(byKind("drop")).toHaveLength(1);
    expect(byKind("drop")[0].geometry.coordinates).toEqual([
      [-58.97, -27.4659],
      [nap11.lon, nap11.lat],
    ]);
    expect(byKind("rank").map((f) => f.properties.label)).toEqual(["#1", "#2", "#3"]);
  });

  test("no best candidate: no drop line", () => {
    const geojson = feasibilityToGeoJson(
      resolveHighlight(
        {
          highlight: [
            { kind: "point", id: "selected-point", lat: -27.4165, lon: -59.018, best_nap_id: null },
            { kind: "candidate", id: "NAP-03", rank: 1, feasibility: "not_feasible" },
          ],
          fit_bounds: true,
        },
        network,
      ),
      network,
    );

    expect(geojson.features.some((f) => f.properties.kind === "drop")).toBe(false);
  });

  test("a payload with no point or candidates draws nothing", () => {
    const geojson = feasibilityToGeoJson(
      resolveHighlight({ highlight: [{ kind: "run", id: "FR-03", status: "cut" }], fit_bounds: true }, network),
      network,
    );

    expect(geojson.features).toEqual([]);
  });
});
