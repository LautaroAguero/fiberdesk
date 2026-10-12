import { describe, expect, test } from "vitest";

import { resolveHighlight, type LngLatBoundsTuple } from "@/lib/map/highlight";
import { loadNetwork } from "@/lib/network/load";
import type { HighlightPayload } from "@/lib/assistant/events";

const network = loadNetwork();

const REFERENCE_PAYLOAD: HighlightPayload = {
  highlight: [
    { kind: "nap", id: "NAP-12", status: "marginal", margin_db: 2.77 },
    { kind: "run", id: "FR-03", status: "marginal" },
    { kind: "run", id: "FR-12", status: "marginal" },
    { kind: "nap", id: "NAP-09", status: "fail", margin_db: -1.4 },
    { kind: "run", id: "FR-04", status: "fail" },
    { kind: "run", id: "FR-09", status: "fail" },
  ],
  fit_bounds: true,
};

const SUB_025_PAYLOAD: HighlightPayload = {
  highlight: [
    { kind: "subscriber", id: "SUB-025", nap_id: "NAP-12", status: "marginal", margin_db: 1.85 },
    { kind: "run", id: "FR-03", status: "marginal" },
    { kind: "run", id: "FR-12", status: "marginal" },
  ],
  fit_bounds: true,
};

/** Asserts every `[lon, lat]` point lies inside `bounds`. */
function expectContained(bounds: LngLatBoundsTuple, points: Array<[number, number]>): void {
  const [[west, south], [east, north]] = bounds;
  for (const [lon, lat] of points) {
    expect(lon).toBeGreaterThanOrEqual(west);
    expect(lon).toBeLessThanOrEqual(east);
    expect(lat).toBeGreaterThanOrEqual(south);
    expect(lat).toBeLessThanOrEqual(north);
  }
}

function runVertices(...runIds: string[]): Array<[number, number]> {
  return network.fiber_runs.filter((run) => runIds.includes(run.id)).flatMap((run) => run.geometry);
}

describe("2.2 resolveHighlight on the reference question", () => {
  const result = resolveHighlight(REFERENCE_PAYLOAD, network);

  test("napStatus has exactly the two payload NAPs, with the payload's own status", () => {
    expect(result.napStatus).toEqual({ "NAP-12": "marginal", "NAP-09": "fail" });
    expect(result.subscriberStatus).toEqual({});
  });

  test("runStatus is what the payload's run entries say", () => {
    expect(result.runStatus).toEqual({
      "FR-03": "marginal",
      "FR-12": "marginal",
      "FR-04": "fail",
      "FR-09": "fail",
    });
    expect([...result.runIds].sort()).toEqual(["FR-03", "FR-04", "FR-09", "FR-12"]);
  });

  test("the other ten NAPs stay neutral", () => {
    const neutral = network.splitters.filter((nap) => result.napStatus[nap.id] === undefined);
    expect(neutral).toHaveLength(10);
  });

  test("unknownIds is empty for a payload naming only real entities", () => {
    expect(result.unknownIds).toEqual([]);
  });

  test("bounds contain the OLT, both NAPs and every vertex of the four runs", () => {
    expect(result.bounds).not.toBeNull();
    const nap09 = network.splitters.find((nap) => nap.id === "NAP-09")!;
    const nap12 = network.splitters.find((nap) => nap.id === "NAP-12")!;
    expectContained(result.bounds!, [
      [network.olt.lon, network.olt.lat],
      [nap09.lon, nap09.lat],
      [nap12.lon, nap12.lat],
      ...runVertices("FR-03", "FR-04", "FR-09", "FR-12"),
    ]);
  });
});

describe("2.2 resolveHighlight on a traced subscriber", () => {
  const result = resolveHighlight(SUB_025_PAYLOAD, network);

  test("the subscriber and its path take its status; NAP-12 and the rest stay neutral", () => {
    expect(result.subscriberStatus).toEqual({ "SUB-025": "marginal" });
    expect(result.napStatus).toEqual({});
    expect(result.runStatus).toEqual({ "FR-03": "marginal", "FR-12": "marginal" });
  });

  test("bounds contain SUB-025, the OLT and every vertex of FR-03 and FR-12", () => {
    expect(result.bounds).not.toBeNull();
    const sub = network.subscribers.find((s) => s.id === "SUB-025")!;
    expectContained(result.bounds!, [
      [sub.lon, sub.lat],
      [network.olt.lon, network.olt.lat],
      ...runVertices("FR-03", "FR-12"),
    ]);
  });
});

describe("2.2 resolveHighlight edge cases", () => {
  test("a shared run takes the worse classification, in either order", () => {
    // SUB-006 (pass) hangs from NAP-03; NAP-12 (marginal) hangs below NAP-03 too: both mark FR-03.
    const passFirst: HighlightPayload = {
      highlight: [
        { kind: "subscriber", id: "SUB-006", nap_id: "NAP-03", status: "pass", margin_db: 19 },
        { kind: "run", id: "FR-03", status: "pass" },
        { kind: "nap", id: "NAP-12", status: "marginal", margin_db: 2.77 },
        { kind: "run", id: "FR-03", status: "marginal" },
        { kind: "run", id: "FR-12", status: "marginal" },
      ],
      fit_bounds: true,
    };
    expect(resolveHighlight(passFirst, network).runStatus["FR-03"]).toBe("marginal");

    const marginalFirst: HighlightPayload = {
      highlight: [
        { kind: "run", id: "FR-03", status: "marginal" },
        { kind: "run", id: "FR-03", status: "pass" },
      ],
      fit_bounds: false,
    };
    expect(resolveHighlight(marginalFirst, network).runStatus["FR-03"]).toBe("marginal");
  });

  test("an unknown NAP is ignored and the rest is still drawn", () => {
    const payload: HighlightPayload = {
      highlight: [
        { kind: "nap", id: "NAP-99", status: "fail", margin_db: -5 },
        { kind: "nap", id: "NAP-01", status: "pass", margin_db: 10 },
      ],
      fit_bounds: true,
    };

    const result = resolveHighlight(payload, network);

    expect(result.unknownIds).toEqual(["NAP-99"]);
    expect(result.napStatus).toEqual({ "NAP-01": "pass" });
    expect(result.bounds).not.toBeNull();
  });

  test("an unknown subscriber or run is ignored and the rest is still drawn", () => {
    const payload: HighlightPayload = {
      highlight: [
        { kind: "subscriber", id: "SUB-099", nap_id: "NAP-12", status: "fail", margin_db: -5 },
        { kind: "run", id: "FR-99", status: "fail" },
        { kind: "subscriber", id: "SUB-025", nap_id: "NAP-12", status: "marginal", margin_db: 1.85 },
        { kind: "run", id: "FR-12", status: "marginal" },
      ],
      fit_bounds: true,
    };

    const result = resolveHighlight(payload, network);

    expect(result.unknownIds).toEqual(["SUB-099", "FR-99"]);
    expect(result.subscriberStatus).toEqual({ "SUB-025": "marginal" });
    expect(result.runStatus).toEqual({ "FR-12": "marginal" });
    expect(result.bounds).not.toBeNull();
  });

  test("fit_bounds: false gives bounds: null with statuses still set", () => {
    const result = resolveHighlight({ ...REFERENCE_PAYLOAD, fit_bounds: false }, network);

    expect(result.bounds).toBeNull();
    expect(result.napStatus).toEqual({ "NAP-12": "marginal", "NAP-09": "fail" });
  });

  test("an empty payload gives empty status, no runs, bounds: null", () => {
    const result = resolveHighlight({ highlight: [], fit_bounds: true }, network);

    expect(result.napStatus).toEqual({});
    expect(result.subscriberStatus).toEqual({});
    expect(result.runIds).toEqual([]);
    expect(result.runStatus).toEqual({});
    expect(result.bounds).toBeNull();
  });

  test("runs alone do not reframe: bounds need a NAP or subscriber the map knows", () => {
    const result = resolveHighlight(
      { highlight: [{ kind: "run", id: "FR-03", status: "fail" }], fit_bounds: true },
      network,
    );
    expect(result.bounds).toBeNull();
  });

  test("the status in the result is the payload's even when it disagrees with the engine's", () => {
    // NAP-03 actually passes; feed it a payload claiming "fail" to prove the
    // map trusts the payload and never reclassifies.
    const payload: HighlightPayload = {
      highlight: [{ kind: "nap", id: "NAP-03", status: "fail", margin_db: -99 }],
      fit_bounds: false,
    };

    expect(resolveHighlight(payload, network).napStatus).toEqual({ "NAP-03": "fail" });
  });
});

const CUT_FR03_PAYLOAD: HighlightPayload = {
  highlight: [
    { kind: "run", id: "FR-03", status: "cut" },
    { kind: "nap", id: "NAP-03", status: "out_of_service" },
    { kind: "nap", id: "NAP-12", status: "out_of_service" },
    { kind: "subscriber", id: "SUB-006", nap_id: "NAP-03", status: "out_of_service" },
    { kind: "subscriber", id: "SUB-025", nap_id: "NAP-12", status: "out_of_service" },
    { kind: "subscriber", id: "SUB-026", nap_id: "NAP-12", status: "out_of_service" },
    { kind: "subscriber", id: "SUB-027", nap_id: "NAP-12", status: "out_of_service" },
    { kind: "subscriber", id: "SUB-028", nap_id: "NAP-12", status: "out_of_service" },
    { kind: "run", id: "FR-12", status: "out_of_service" },
  ],
  fit_bounds: true,
};

describe("2.3 resolveHighlight on a cut", () => {
  const result = resolveHighlight(CUT_FR03_PAYLOAD, network);

  test("a cut through a cascade: FR-03 is cut, the subtree is out of service, the rest neutral", () => {
    expect(result.runStatus).toEqual({ "FR-03": "cut", "FR-12": "out_of_service" });
    expect(result.napStatus).toEqual({ "NAP-03": "out_of_service", "NAP-12": "out_of_service" });
    expect(result.subscriberStatus).toEqual({
      "SUB-006": "out_of_service",
      "SUB-025": "out_of_service",
      "SUB-026": "out_of_service",
      "SUB-027": "out_of_service",
      "SUB-028": "out_of_service",
    });
    expect(result.unknownIds).toEqual([]);
    expect(network.splitters.filter((nap) => result.napStatus[nap.id] === undefined)).toHaveLength(10);
  });

  test("an outage outranks a classification on the same element, in either order", () => {
    const classifiedFirst: HighlightPayload = {
      highlight: [
        { kind: "run", id: "FR-03", status: "marginal" },
        { kind: "run", id: "FR-03", status: "cut" },
      ],
      fit_bounds: false,
    };
    const cutFirst: HighlightPayload = { highlight: [...classifiedFirst.highlight].reverse(), fit_bounds: false };
    expect(resolveHighlight(classifiedFirst, network).runStatus["FR-03"]).toBe("cut");
    expect(resolveHighlight(cutFirst, network).runStatus["FR-03"]).toBe("cut");

    const nap: HighlightPayload = {
      highlight: [
        { kind: "nap", id: "NAP-12", status: "out_of_service" },
        { kind: "nap", id: "NAP-12", status: "marginal", margin_db: 2.77 },
      ],
      fit_bounds: false,
    };
    expect(resolveHighlight(nap, network).napStatus["NAP-12"]).toBe("out_of_service");
  });

  test("a cut does not reclassify: statuses are the payload's own", () => {
    const run = resolveHighlight(
      { highlight: [{ kind: "run", id: "FR-12", status: "out_of_service" }], fit_bounds: true },
      network,
    );
    expect(run.runStatus).toEqual({ "FR-12": "out_of_service" });
  });

  test("reframing on a cut: bounds contain the subtree, the OLT and every vertex of FR-03 and FR-12", () => {
    expect(result.bounds).not.toBeNull();
    const points: Array<[number, number]> = [[network.olt.lon, network.olt.lat]];
    for (const nap of network.splitters.filter((n) => ["NAP-03", "NAP-12"].includes(n.id))) {
      points.push([nap.lon, nap.lat]);
    }
    for (const sub of network.subscribers.filter((s) => result.subscriberStatus[s.id] !== undefined)) {
      points.push([sub.lon, sub.lat]);
    }
    expectContained(result.bounds!, [...points, ...runVertices("FR-03", "FR-12")]);
  });
});
