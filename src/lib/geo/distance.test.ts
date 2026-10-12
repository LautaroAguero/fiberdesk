import { describe, expect, test } from "vitest";

import { haversineKm } from "@/lib/geo/distance";
import { loadNetwork } from "@/lib/network/load";

const network = loadNetwork();

describe("1.1 haversine distance", () => {
  test("one degree of longitude on the equator is 111.195 km", () => {
    const km = haversineKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 });
    expect(km).toBeCloseTo(111.195, 3);
  });

  test("the distance is symmetric", () => {
    const a = { lat: -27.4512, lon: -58.9866 };
    const b = { lat: -27.439, lon: -58.9721 };
    expect(haversineKm(a, b)).toBe(haversineKm(b, a));
  });

  test("a point to itself is zero", () => {
    const a = { lat: -27.4512, lon: -58.9866 };
    expect(haversineKm(a, a)).toBe(0);
  });

  test("NAP-12 to SUB-025 is 0.38291 km", () => {
    const nap = network.splitters.find((n) => n.id === "NAP-12")!;
    const sub = network.subscribers.find((s) => s.id === "SUB-025")!;
    expect(haversineKm(nap, sub)).toBeCloseTo(0.38291, 5);
  });
});
