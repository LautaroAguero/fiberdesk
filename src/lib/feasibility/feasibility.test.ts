import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { CANDIDATE_COUNT, evaluateConnection } from "@/lib/feasibility/feasibility";
import { loadNetwork } from "@/lib/network/load";
import type { Network } from "@/lib/network/types";
import { traceSubscriber } from "@/lib/optical/trace";

const network = loadNetwork();

const POINTS = {
  A: { lat: -27.4165, lon: -59.018 },
  B: { lat: -27.4955, lon: -58.938 },
  C: { lat: -27.4432, lon: -58.977 },
  D: { lat: -27.493, lon: -59.0338 },
  E: { lat: -27.4659, lon: -58.97 },
  F: { lat: -27.43, lon: -58.94 },
};

interface OracleEntry {
  point: { lat: number; lon: number };
  candidates: unknown[];
  best_nap_id: string | null;
  feasible_count: number;
}
const oracle: {
  points: Record<string, OracleEntry>;
  subscriber_positions: Record<string, OracleEntry>;
} = JSON.parse(readFileSync(path.join(process.cwd(), "seed", "expected-feasibility.json"), "utf8"));

function candidate(result: ReturnType<typeof evaluateConnection>, napId: string) {
  const found = result.candidates.find((c) => c.nap_id === napId);
  if (found === undefined) throw new Error(`${napId} is not a candidate`);
  return found;
}

/** A copy of the seed in which a NAP and its feeder run are duplicated under new ids. */
function withTwin(base: Network, from: string, twinNap: string, twinRun: string): Network {
  const nap = base.splitters.find((n) => n.id === from);
  const run = base.fiber_runs.find((r) => r.to === from);
  if (nap === undefined || run === undefined) throw new Error("seed changed");
  return {
    ...base,
    splitters: [...base.splitters, { ...nap, id: twinNap }],
    fiber_runs: [...base.fiber_runs, { ...run, id: twinRun, to: twinNap }],
  };
}

describe("2.2 the feasibility engine", () => {
  test("(a) A: the nearest NAP is full, the others are far", () => {
    const result = evaluateConnection(network, POINTS.A);

    expect(result.candidates.map((c) => c.nap_id)).toEqual(["NAP-03", "NAP-08", "NAP-12"]);
    const nap03 = candidate(result, "NAP-03");
    expect(nap03.reasons).toEqual(["no_free_ports"]);
    expect(nap03.route_m).toBe(217);
    expect(nap03.projected.margin_db).toBe(19.17);
    expect(candidate(result, "NAP-08").route_m).toBe(3252);
    expect(candidate(result, "NAP-08").reasons).toEqual(["too_far"]);
    expect(candidate(result, "NAP-12").route_m).toBe(3549);
    expect(candidate(result, "NAP-12").reasons).toEqual(["too_far"]);
    expect(result.best_nap_id).toBeNull();
    expect(result.feasible_count).toBe(0);
  });

  test("(b) B: close, with ports, failing", () => {
    const nap09 = candidate(evaluateConnection(network, POINTS.B), "NAP-09");

    expect(nap09.reasons).toEqual(["budget_fail"]);
    expect(nap09.ports.free).toBe(5);
    expect(nap09.projected.total_loss_db).toBe(30.25);
    expect(nap09.projected.margin_db).toBe(-2.25);
    expect(nap09.projected.status).toBe("fail");
  });

  test("(c) C: a comfortable connection", () => {
    const result = evaluateConnection(network, POINTS.C);
    const nap01 = candidate(result, "NAP-01");

    expect(nap01.feasible).toBe(true);
    expect(nap01.route_m).toBe(205);
    expect(nap01.projected.margin_db).toBe(14.81);
    expect(nap01.projected.status).toBe("pass");
    expect(result.best_nap_id).toBe("NAP-01");
  });

  test("(d) D: feasible with a marginal projection while the NAP itself passes", () => {
    const nap06 = candidate(evaluateConnection(network, POINTS.D), "NAP-06");

    expect(nap06.feasible).toBe(true);
    expect(nap06.projected.margin_db).toBe(2.51);
    expect(nap06.projected.status).toBe("marginal");
    expect(nap06.nap_status).toBe("pass");
    expect(nap06.nap_margin_db).toBe(3.44);
  });

  test("(e) E: two feasible NAPs rank before the infeasible one", () => {
    const result = evaluateConnection(network, POINTS.E);

    expect(result.candidates.map((c) => [c.nap_id, c.rank])).toEqual([
      ["NAP-11", 1],
      ["NAP-05", 2],
      ["NAP-04", 3],
    ]);
    expect(result.best_nap_id).toBe("NAP-11");
    expect(result.feasible_count).toBe(2);
    expect(candidate(result, "NAP-04").reasons).toEqual(["too_far"]);
  });

  test("(f) F: out of coverage", () => {
    const result = evaluateConnection(network, POINTS.F);

    expect(result.candidates.map((c) => c.nap_id)).toEqual(["NAP-10", "NAP-07", "NAP-01"]);
    for (const c of result.candidates) expect(c.reasons).toEqual(["too_far"]);
    expect(result.best_nap_id).toBeNull();
  });

  test("(g) a feasible second NAP ranks before an infeasible nearest one", () => {
    // NAP-11 (two subscribers) becomes a 1:2: full. NAP-05 stays feasible.
    const crowded: Network = {
      ...network,
      splitters: network.splitters.map((n) => (n.id === "NAP-11" ? { ...n, ratio: "1:2" } : n)),
    };
    const result = evaluateConnection(crowded, POINTS.E);

    expect(result.candidates[0].nap_id).toBe("NAP-05");
    expect(result.candidates[0].rank).toBe(1);
    expect(result.candidates[1].nap_id).toBe("NAP-11");
    expect(result.candidates[1].reasons).toEqual(["no_free_ports"]);
    expect(result.best_nap_id).toBe("NAP-05");
  });

  test("(h) a NAP failing all three checks lists every reason in order", () => {
    // Fill NAP-09's five free ports, then ask for a point about 700 m away.
    const template = network.subscribers[0];
    const filled: Network = {
      ...network,
      subscribers: [
        ...network.subscribers,
        ...[1, 2, 3, 4, 5].map((i) => ({ ...template, id: `SUB-90${i}`, nap: "NAP-09" })),
      ],
    };
    const nap09 = network.splitters.find((n) => n.id === "NAP-09");
    if (nap09 === undefined) throw new Error("seed changed");
    const result = evaluateConnection(filled, { lat: nap09.lat + 0.0063, lon: nap09.lon });

    expect(candidate(result, "NAP-09").reasons).toEqual(["too_far", "no_free_ports", "budget_fail"]);
  });

  test("(i) at SUB-025's position NAP-12's projection equals SUB-025's trace", () => {
    const sub = network.subscribers.find((s) => s.id === "SUB-025");
    if (sub === undefined) throw new Error("seed changed");
    const trace = traceSubscriber(network, "SUB-025");
    const nap12 = candidate(evaluateConnection(network, { lat: sub.lat, lon: sub.lon }), "NAP-12");

    expect(nap12.projected.total_loss_db).toBe(26.15);
    expect(nap12.projected.margin_db).toBe(1.85);
    expect(nap12.projected.status).toBe("marginal");
    expect(nap12.projected.total_loss_db).toBe(trace.total_loss_db);
    expect(nap12.projected.by_source).toEqual(trace.by_source);
    expect(nap12.drop).toEqual(trace.drop);
  });

  test("(j) a tie in distance breaks by NAP id", () => {
    // NAP-00 sits exactly where NAP-01 does: same distance to any point.
    const twin = withTwin(network, "NAP-01", "NAP-00", "FR-00");
    const result = evaluateConnection(twin, POINTS.C);

    expect(result.candidates.slice(0, 2).map((c) => c.nap_id)).toEqual(["NAP-00", "NAP-01"]);
    expect(result.candidates[0].rank).toBe(1);
  });

  test("(k) a point outside the city, and a NaN latitude, throw naming the problem", () => {
    expect(() => evaluateConnection(network, { lat: -34.6037, lon: -58.3816 })).toThrow(
      /outside the modelled city/,
    );
    expect(() => evaluateConnection(network, { lat: Number.NaN, lon: -58.97 })).toThrow(/not a finite/);
  });

  test("(l) the point is echoed exactly as given", () => {
    const point = { lat: -27.465912345, lon: -58.970054321 };

    expect(evaluateConnection(network, point).point).toEqual(point);
  });

  test("(m) every point and subscriber position equals the committed oracle", () => {
    expect(Object.keys(oracle.points)).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(Object.keys(oracle.subscriber_positions)).toHaveLength(28);

    for (const [name, expected] of Object.entries(oracle.points)) {
      const actual = evaluateConnection(network, expected.point);
      expect(actual.candidates, name).toEqual(expected.candidates);
      expect(actual.best_nap_id, name).toBe(expected.best_nap_id);
      expect(actual.feasible_count, name).toBe(expected.feasible_count);
      expect(actual.point, name).toEqual(expected.point);
    }
    for (const [id, expected] of Object.entries(oracle.subscriber_positions)) {
      const actual = evaluateConnection(network, expected.point);
      expect(actual.candidates, id).toEqual(expected.candidates);
      expect(actual.best_nap_id, id).toBe(expected.best_nap_id);
      expect(actual.feasible_count, id).toBe(expected.feasible_count);
    }
  });

  test("the oracle points are the ones this suite names", () => {
    for (const [name, point] of Object.entries(POINTS)) {
      expect(oracle.points[name as keyof typeof POINTS].point).toEqual(point);
    }
    expect(CANDIDATE_COUNT).toBe(3);
  });

  test("(n) two calls give deep-equal results", () => {
    expect(evaluateConnection(network, POINTS.E)).toEqual(evaluateConnection(network, POINTS.E));
  });
});
