import { describe, expect, test } from "vitest";

import { resolveHighlight } from "@/lib/map/highlight";
import { calculateAllBudgets } from "@/lib/optical/budget";
import { loadNetwork } from "@/lib/network/load";
import type { HighlightPayload } from "@/lib/assistant/events";

const network = loadNetwork();
const budgets = calculateAllBudgets(network);

const REFERENCE_PAYLOAD: HighlightPayload = {
  highlight: [
    { nap_id: "NAP-12", status: "marginal", margin_db: 2.77 },
    { nap_id: "NAP-09", status: "fail", margin_db: -1.4 },
  ],
  fit_bounds: true,
};

describe("2.2 resolveHighlight on the reference payload", () => {
  const result = resolveHighlight(REFERENCE_PAYLOAD, network, budgets);

  test("napStatus has exactly the two payload entries, with the payload's own status", () => {
    expect(result.napStatus).toEqual({ "NAP-12": "marginal", "NAP-09": "fail" });
  });

  test("runIds come from each NAP's own hops, not a re-walked tree", () => {
    expect(result.runIds.sort()).toEqual(["FR-03", "FR-04", "FR-09", "FR-12"].sort());
  });

  test("bounds contain the OLT, both NAPs and every vertex of the four runs", () => {
    expect(result.bounds).not.toBeNull();
    const [[west, south], [east, north]] = result.bounds!;

    const allPoints: Array<[number, number]> = [
      [network.olt.lon, network.olt.lat],
      ...network.fiber_runs
        .filter((run) => ["FR-03", "FR-04", "FR-09", "FR-12"].includes(run.id))
        .flatMap((run) => run.geometry),
    ];

    for (const [lon, lat] of allPoints) {
      expect(lon).toBeGreaterThanOrEqual(west);
      expect(lon).toBeLessThanOrEqual(east);
      expect(lat).toBeGreaterThanOrEqual(south);
      expect(lat).toBeLessThanOrEqual(north);
    }
  });

  test("unknownIds is empty for a payload naming only real NAPs", () => {
    expect(result.unknownIds).toEqual([]);
  });
});

describe("2.2 resolveHighlight edge cases", () => {
  test("fit_bounds: false gives bounds: null with statuses still set", () => {
    const result = resolveHighlight({ ...REFERENCE_PAYLOAD, fit_bounds: false }, network, budgets);

    expect(result.bounds).toBeNull();
    expect(result.napStatus).toEqual({ "NAP-12": "marginal", "NAP-09": "fail" });
  });

  test("an empty payload gives empty status, no runs, bounds: null", () => {
    const result = resolveHighlight({ highlight: [], fit_bounds: true }, network, budgets);

    expect(result.napStatus).toEqual({});
    expect(result.runIds).toEqual([]);
    expect(result.bounds).toBeNull();
  });

  test("an unknown id lands in unknownIds and does not affect the rest", () => {
    const payload: HighlightPayload = {
      highlight: [
        { nap_id: "NAP-99", status: "fail", margin_db: -5 },
        { nap_id: "NAP-01", status: "pass", margin_db: 10 },
      ],
      fit_bounds: true,
    };

    const result = resolveHighlight(payload, network, budgets);

    expect(result.unknownIds).toEqual(["NAP-99"]);
    expect(result.napStatus).toEqual({ "NAP-01": "pass" });
    expect(result.bounds).not.toBeNull();
  });

  test("the status in the result is the payload's even when it disagrees with the budget's", () => {
    // NAP-03 actually passes; feed it a payload claiming "fail" to prove the
    // map trusts the payload, not a re-classification from `budgets`.
    const payload: HighlightPayload = {
      highlight: [{ nap_id: "NAP-03", status: "fail", margin_db: -99 }],
      fit_bounds: false,
    };

    const result = resolveHighlight(payload, network, budgets);

    expect(result.napStatus).toEqual({ "NAP-03": "fail" });
  });
});
