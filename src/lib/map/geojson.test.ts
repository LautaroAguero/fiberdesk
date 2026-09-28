import { describe, expect, test } from "vitest";

import { networkToGeoJson } from "@/lib/map/geojson";
import { loadNetwork } from "@/lib/network/load";

const network = loadNetwork();
const geojson = networkToGeoJson(network);

describe("2.1 networkToGeoJson draws only what the seed contains", () => {
  test("one OLT, twelve NAPs, twelve runs, twenty-eight subscribers", () => {
    expect(geojson.olt.features).toHaveLength(1);
    expect(geojson.naps.features).toHaveLength(12);
    expect(geojson.runs.features).toHaveLength(12);
    expect(geojson.subscribers.features).toHaveLength(28);
  });

  test("node coordinates are [lon, lat], not [lat, lon]", () => {
    expect(geojson.olt.features[0].geometry.coordinates).toEqual([-58.9866, -27.4512]);
  });

  test("FR-12's first vertex is NAP-03's position, since it hangs off the cascade, not the OLT", () => {
    const fr12 = geojson.runs.features.find((feature) => feature.properties.id === "FR-12");
    const nap03 = geojson.naps.features.find((feature) => feature.properties.id === "NAP-03");

    expect(fr12).toBeDefined();
    expect(nap03).toBeDefined();
    expect(fr12!.geometry.coordinates[0]).toEqual(nap03!.geometry.coordinates);
  });

  test("NAP features carry id, name, ratio and parent", () => {
    const nap12 = geojson.naps.features.find((feature) => feature.properties.id === "NAP-12");

    expect(nap12).toBeDefined();
    expect(nap12!.properties).toEqual({
      id: "NAP-12",
      name: expect.any(String),
      ratio: "1:16",
      parent: "NAP-03",
    });
  });
});
