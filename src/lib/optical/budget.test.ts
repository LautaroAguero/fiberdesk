import { describe, expect, test } from "vitest";

import { calculateAllBudgets, calculateBudget } from "@/lib/optical/budget";
import { loadNetwork } from "@/lib/network/load";
import type { Network } from "@/lib/network/types";

const network = loadNetwork();

describe("2.1 path traversal", () => {
  test("a link served directly from the OLT is a single hop", () => {
    const result = calculateBudget(network, "NAP-01");

    expect(result.hops).toHaveLength(1);
    expect(result.hops[0].run_id).toBe("FR-01");
    expect(result.hops[0].from).toBe("OLT-RES-01");
    expect(result.hops[0].to).toBe("NAP-01");
  });

  test("a cascade reports both hops, OLT-side first", () => {
    const result = calculateBudget(network, "NAP-12");

    expect(result.hops).toHaveLength(2);
    expect(result.hops[0].run_id).toBe("FR-03");
    expect(result.hops[0].from).toBe("OLT-RES-01");
    expect(result.hops[0].to).toBe("NAP-03");
    expect(result.hops[1].run_id).toBe("FR-12");
    expect(result.hops[1].from).toBe("NAP-03");
    expect(result.hops[1].to).toBe("NAP-12");
  });
});

describe("2.2 the traversal refuses to loop", () => {
  /** A network with only what walkToOlt reads, so the cycle is unambiguous. */
  function networkWithCycle(): Network {
    return {
      olt: { id: "OLT-1", name: "Head End", lat: -27.45, lon: -58.98, tx_power_dbm: 3, gpon_class: "B+" },
      splitters: [
        { id: "NAP-A", name: "A", lat: -27.44, lon: -58.98, ratio: "1:8", parent: "NAP-B" },
        { id: "NAP-B", name: "B", lat: -27.46, lon: -58.97, ratio: "1:16", parent: "NAP-A" },
      ],
      fiber_runs: [
        { id: "FR-A", from: "NAP-B", to: "NAP-A", length_km: 1, splices: 1, connectors: 1, geometry: [] },
        { id: "FR-B", from: "NAP-A", to: "NAP-B", length_km: 1, splices: 1, connectors: 1, geometry: [] },
      ],
      subscribers: [],
    };
  }

  test("a two-NAP cascade cycle raises, naming both NAPs", () => {
    const cyclic = networkWithCycle();

    expect(() => calculateBudget(cyclic, "NAP-A")).toThrow(/NAP-A/);
    expect(() => calculateBudget(cyclic, "NAP-A")).toThrow(/NAP-B/);
  });
});

describe("2.3 an unknown NAP is refused", () => {
  test("requesting NAP-99 raises, naming it, and returns nothing", () => {
    let result: unknown = "sentinel";

    expect(() => {
      result = calculateBudget(network, "NAP-99");
    }).toThrow(/NAP-99/);

    expect(result).toBe("sentinel");
  });
});

describe("3.1 per-hop loss contributions", () => {
  test("NAP-12's hops match the design table exactly", () => {
    const result = calculateBudget(network, "NAP-12");
    const [hop1, hop2] = result.hops;

    expect(hop1.fiber_db).toBe(2.8);
    expect(hop1.splitter).toEqual({ at: "NAP-03", ratio: "1:2", loss_db: 3.5 });
    expect(hop1.connectors_db).toBe(1.2);
    expect(hop1.splices_db).toBe(0.48);

    expect(hop2.fiber_db).toBe(2.15);
    expect(hop2.splitter).toEqual({ at: "NAP-12", ratio: "1:16", loss_db: 13.5 });
    expect(hop2.connectors_db).toBe(1.2);
    expect(hop2.splices_db).toBe(0.4);
  });

  test("the inherited splitter is attributed to its own NAP, not the one being queried", () => {
    const result = calculateBudget(network, "NAP-12");

    const ownSplitter = result.hops.find((h) => h.splitter.at === "NAP-12");
    const inheritedSplitter = result.hops.find((h) => h.splitter.at === "NAP-03");

    expect(ownSplitter?.splitter.loss_db).toBe(13.5);
    expect(inheritedSplitter?.splitter.loss_db).toBe(3.5);
  });

  test("no literal loss values leak into hop contributions beyond what the constants module defines", () => {
    // Every splitter loss reported must be one of the values the constants
    // module knows about, not an inline figure.
    const result = calculateAllBudgets(network);
    const knownSplitterLosses = new Set([3.5, 7.2, 10.5, 13.5, 17.0]);

    for (const budget of result) {
      for (const hop of budget.hops) {
        expect(knownSplitterLosses.has(hop.splitter.loss_db)).toBe(true);
      }
    }
  });
});

describe("3.2 per-source totals and total attenuation", () => {
  test("NAP-01 totals 12.34 dB", () => {
    expect(calculateBudget(network, "NAP-01").total_loss_db).toBe(12.34);
  });

  test("NAP-12 totals 25.23 dB", () => {
    expect(calculateBudget(network, "NAP-12").total_loss_db).toBe(25.23);
  });

  test("NAP-09 totals 29.40 dB", () => {
    expect(calculateBudget(network, "NAP-09").total_loss_db).toBe(29.4);
  });

  test("the four sources sum to the reported total, for every NAP", () => {
    for (const result of calculateAllBudgets(network)) {
      const sum =
        result.by_source.fiber_db +
        result.by_source.splitters_db +
        result.by_source.connectors_db +
        result.by_source.splices_db;
      expect(sum).toBeCloseTo(result.total_loss_db, 10);
    }
  });
});

describe("4.1 margin follows the OLT's declared GPON class", () => {
  test("NAP-12 under the dataset's declared B+ class", () => {
    const result = calculateBudget(network, "NAP-12");

    expect(result.gpon_class).toBe("B+");
    expect(result.budget_db).toBe(28);
    expect(result.margin_db).toBe(2.77);
  });

  test("the same link under a C+ OLT: same attenuation, different margin", () => {
    const cPlusNetwork: Network = { ...network, olt: { ...network.olt, gpon_class: "C+" } };
    const result = calculateBudget(cPlusNetwork, "NAP-12");

    expect(result.total_loss_db).toBe(25.23);
    expect(result.budget_db).toBe(32);
    expect(result.margin_db).toBe(6.77);
  });
});

describe("4.2 classification against the default minimum margin", () => {
  test("NAP-09 fails: margin -1.40 dB", () => {
    const result = calculateBudget(network, "NAP-09");
    expect(result.margin_db).toBe(-1.4);
    expect(result.status).toBe("fail");
  });

  test("NAP-12 is marginal: margin 2.77 dB, under the 3.00 dB minimum", () => {
    const result = calculateBudget(network, "NAP-12");
    expect(result.margin_db).toBe(2.77);
    expect(result.status).toBe("marginal");
  });

  test("NAP-06 passes just above the minimum: margin 3.44 dB", () => {
    const result = calculateBudget(network, "NAP-06");
    expect(result.margin_db).toBe(3.44);
    expect(result.status).toBe("pass");
  });

  test("NAP-01 passes with comfortable margin: 15.66 dB", () => {
    const result = calculateBudget(network, "NAP-01");
    expect(result.margin_db).toBe(15.66);
    expect(result.status).toBe("pass");
  });
});

describe("4.3 the minimum margin is overridable and reclassifies without changing physics", () => {
  test("raising the minimum to 5.00 dB reclassifies NAP-06 as marginal", () => {
    const result = calculateBudget(network, "NAP-06", { minMarginDb: 5.0 });

    expect(result.total_loss_db).toBe(24.56);
    expect(result.margin_db).toBe(3.44);
    expect(result.status).toBe("marginal");
  });
});

describe("5.1 received optical power is informational", () => {
  test("NAP-12 reports -22.23 dBm", () => {
    expect(calculateBudget(network, "NAP-12").rx_power_dbm).toBe(-22.23);
  });

  test("NAP-09 reports -26.40 dBm and is still classified as failing", () => {
    const result = calculateBudget(network, "NAP-09");
    expect(result.rx_power_dbm).toBe(-26.4);
    expect(result.status).toBe("fail");
  });
});

describe("6.1 the whole network in one pass", () => {
  test("12 results, with exactly one failure and one marginal link", () => {
    const results = calculateAllBudgets(network);

    expect(results).toHaveLength(12);
    expect(results.filter((r) => r.status === "fail").map((r) => r.nap_id)).toEqual(["NAP-09"]);
    expect(results.filter((r) => r.status === "marginal").map((r) => r.nap_id)).toEqual(["NAP-12"]);
    expect(results.filter((r) => r.status === "pass")).toHaveLength(10);
  });

  test("results are ordered as network.splitters", () => {
    const results = calculateAllBudgets(network);
    expect(results.map((r) => r.nap_id)).toEqual(network.splitters.map((s) => s.id));
  });
});

describe("6.2 batch and individual results agree", () => {
  test("every batch entry equals its individually computed result", () => {
    const batch = calculateAllBudgets(network);

    for (const napResult of batch) {
      const individual = calculateBudget(network, napResult.nap_id);
      expect(napResult).toEqual(individual);
    }
  });
});

describe("7.1 determinism", () => {
  test("two calls for the same NAP return identical results", () => {
    expect(calculateBudget(network, "NAP-12")).toEqual(calculateBudget(network, "NAP-12"));
  });

  test("no floating-point residue: NAP-12's total is exactly 25.23", () => {
    const result = calculateBudget(network, "NAP-12");
    expect(result.total_loss_db).toBe(25.23);
    expect(String(result.total_loss_db)).toBe("25.23");
  });
});
