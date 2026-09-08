/**
 * Acceptance tests for the dataset itself.
 *
 * These assert that the committed network still has the shape the spec requires:
 * the accumulated inputs along each path match the fixture, and the deliberate
 * edge cases are still there. No optical arithmetic happens here — summing dB is
 * Phase 1's job, and `seed/expected-budgets.json` is the oracle it must reproduce.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { loadNetwork } from "@/lib/network/load";
import type { Nap, Network, SplitterRatio } from "@/lib/network/types";

interface ExpectedNap {
  cumulative_km: number;
  connectors: number;
  splices: number;
  splitter_chain: SplitterRatio[];
  total_db: number;
  margin_db: number;
  status: "pass" | "marginal" | "fail";
}

interface Fixture {
  gpon_class: string;
  budget_db: number;
  min_margin_db: number;
  naps: Record<string, ExpectedNap>;
}

const network = loadNetwork();
const fixture: Fixture = JSON.parse(
  readFileSync(path.join(process.cwd(), "seed", "expected-budgets.json"), "utf8"),
);

/** Accumulates the loss *inputs* from a NAP up to the OLT. Deliberately no dB. */
function accumulate(net: Network, napId: string) {
  const napById = new Map(net.splitters.map((s) => [s.id, s]));
  const runTo = new Map(net.fiber_runs.map((r) => [r.to, r]));

  let km = 0;
  let connectors = 0;
  let splices = 0;
  const chain: SplitterRatio[] = [];

  let cursor = napId;
  const guard = new Set<string>();
  while (cursor !== net.olt.id) {
    if (guard.has(cursor)) throw new Error(`cycle through ${cursor}`);
    guard.add(cursor);

    const nap = napById.get(cursor) as Nap;
    const run = runTo.get(cursor);
    if (run === undefined) throw new Error(`no fiber run reaches ${cursor}`);

    km += run.length_km;
    connectors += run.connectors;
    splices += run.splices;
    chain.unshift(nap.ratio);
    cursor = nap.parent;
  }

  return { km, connectors, splices, chain };
}

describe("5.2 accumulated inputs match the fixture", () => {
  test("the fixture covers every NAP in the dataset", () => {
    expect(Object.keys(fixture.naps).sort()).toEqual(network.splitters.map((s) => s.id).sort());
  });

  test.each(network.splitters.map((s) => s.id))("%s accumulates the expected inputs", (napId) => {
    const actual = accumulate(network, napId);
    const expected = fixture.naps[napId];

    expect(actual.km).toBeCloseTo(expected.cumulative_km, 2);
    expect(actual.connectors).toBe(expected.connectors);
    expect(actual.splices).toBe(expected.splices);
    expect(actual.chain).toEqual(expected.splitter_chain);
  });

  test("NAP-12 inherits its parent's splitter, in order from the OLT down", () => {
    expect(accumulate(network, "NAP-12").chain).toEqual(["1:2", "1:16"]);
  });

  test("NAP-09 cascades two 1:8 splitters", () => {
    expect(accumulate(network, "NAP-09").chain).toEqual(["1:8", "1:8"]);
  });

  test("every fiber run is longer than the straight line between its endpoints", () => {
    const positions = new Map<string, { lat: number; lon: number }>([
      [network.olt.id, network.olt],
      ...network.splitters.map((s) => [s.id, s] as const),
    ]);
    const haversineKm = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
      const rad = (d: number) => (d * Math.PI) / 180;
      const dLat = rad(b.lat - a.lat);
      const dLon = rad(b.lon - a.lon);
      const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
      return 2 * 6371 * Math.asin(Math.sqrt(h));
    };

    for (const run of network.fiber_runs) {
      const from = positions.get(run.from)!;
      const to = positions.get(run.to)!;
      expect(run.length_km).toBeGreaterThan(haversineKm(from, to));
    }
  });

  test("each run's geometry starts and ends on its declared endpoints", () => {
    const positions = new Map<string, { lat: number; lon: number }>([
      [network.olt.id, network.olt],
      ...network.splitters.map((s) => [s.id, s] as const),
    ]);

    for (const run of network.fiber_runs) {
      const from = positions.get(run.from)!;
      const to = positions.get(run.to)!;
      expect(run.geometry.at(0)).toEqual([from.lon, from.lat]);
      expect(run.geometry.at(-1)).toEqual([to.lon, to.lat]);
    }
  });
});

describe("5.3 the deliberate edge cases are present", () => {
  const entries = Object.entries(fixture.naps);
  const withStatus = (status: string) => entries.filter(([, v]) => v.status === status).map(([k]) => k);

  test("the dataset is evaluated against GPON class B+", () => {
    expect(fixture.gpon_class).toBe("B+");
    expect(fixture.budget_db).toBe(28);
    expect(fixture.min_margin_db).toBe(3);
  });

  test("NAP-09 is the only failing link, at -1.40 dB", () => {
    expect(withStatus("fail")).toEqual(["NAP-09"]);
    expect(fixture.naps["NAP-09"].total_db).toBe(29.4);
    expect(fixture.naps["NAP-09"].margin_db).toBe(-1.4);
  });

  test("NAP-12 is the only marginal link, at 2.77 dB", () => {
    expect(withStatus("marginal")).toEqual(["NAP-12"]);
    expect(fixture.naps["NAP-12"].total_db).toBe(25.23);
    expect(fixture.naps["NAP-12"].margin_db).toBe(2.77);
  });

  test("the remaining ten NAPs each hold at least the minimum margin", () => {
    const passing = withStatus("pass");
    expect(passing).toHaveLength(10);
    for (const id of passing) {
      expect(fixture.naps[id].margin_db).toBeGreaterThanOrEqual(fixture.min_margin_db);
    }
  });

  test("the classification boundary is exercised from above as well as below", () => {
    // NAP-06 passes, but only just: without it the 3 dB threshold is only ever
    // crossed downward, and an off-by-one in the comparison would go unnoticed.
    const napSix = fixture.naps["NAP-06"];
    expect(napSix.status).toBe("pass");
    expect(napSix.margin_db).toBeGreaterThanOrEqual(fixture.min_margin_db);
    expect(napSix.margin_db).toBeLessThan(fixture.min_margin_db + 1);
  });

  test("both problem NAPs serve subscribers, so 'who is affected' has an answer", () => {
    for (const napId of ["NAP-09", "NAP-12"]) {
      expect(network.subscribers.filter((s) => s.nap === napId).length).toBeGreaterThan(0);
    }
  });

  test("no NAP serves more subscribers than its splitter has ports", () => {
    const ports: Record<SplitterRatio, number> = {
      "1:2": 2,
      "1:4": 4,
      "1:8": 8,
      "1:16": 16,
      "1:32": 32,
    };

    for (const nap of network.splitters) {
      const served = network.subscribers.filter((s) => s.nap === nap.id).length;
      expect(served).toBeGreaterThan(0);
      expect(served).toBeLessThanOrEqual(ports[nap.ratio]);
    }
  });
});
