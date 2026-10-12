import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { loadNetwork } from "@/lib/network/load";
import type { Network } from "@/lib/network/types";
import { cutImpact } from "@/lib/topology/cut";

interface ExpectedCut {
  kind: "run" | "nap";
  naps_out_of_service: string[];
  subscribers_out_of_service: string[];
  runs_out_of_service: string[];
  counts: { naps: number; subscribers: number; runs: number };
}

const network = loadNetwork();
const oracle: { elements: Record<string, ExpectedCut> } = JSON.parse(
  readFileSync(path.join(process.cwd(), "seed", "expected-cut-impacts.json"), "utf8"),
);

const napIds = (id: string) => cutImpact(network, id).naps_out_of_service.map((n) => n.id);
const subIds = (id: string) => cutImpact(network, id).subscribers_out_of_service.map((s) => s.id);

describe("1.2 the cut traversal", () => {
  test("(a) FR-03 takes out NAP-03 and, through the cascade, NAP-12", () => {
    const impact = cutImpact(network, "FR-03");
    expect(impact.element).toMatchObject({ kind: "run", id: "FR-03", to: "NAP-03" });
    expect(napIds("FR-03")).toEqual(["NAP-03", "NAP-12"]);
    expect(subIds("FR-03")).toEqual(["SUB-006", "SUB-025", "SUB-026", "SUB-027", "SUB-028"]);
    expect(impact.counts).toEqual({ naps: 2, subscribers: 5, runs: 1 });
    expect(impact.runs_out_of_service).toEqual(["FR-12"]);
  });

  test("(b) FR-12 is a leaf: only NAP-12, and the NAP above keeps service", () => {
    const impact = cutImpact(network, "FR-12");
    expect(napIds("FR-12")).toEqual(["NAP-12"]);
    expect(subIds("FR-12")).toEqual(["SUB-025", "SUB-026", "SUB-027", "SUB-028"]);
    expect(impact.counts.subscribers).toBe(4);
    expect(impact.runs_out_of_service).toEqual([]);
    expect(napIds("FR-12")).not.toContain("NAP-03");
    expect(subIds("FR-12")).not.toContain("SUB-006");
  });

  test("(c) FR-04 takes out NAP-04 and NAP-09, with FR-09 dark", () => {
    const impact = cutImpact(network, "FR-04");
    expect(napIds("FR-04")).toEqual(["NAP-04", "NAP-09"]);
    expect(subIds("FR-04")).toEqual(["SUB-007", "SUB-008", "SUB-018", "SUB-019", "SUB-020"]);
    expect(impact.counts.subscribers).toBe(5);
    expect(impact.runs_out_of_service).toEqual(["FR-09"]);
  });

  test("(d) FR-01 has nothing below its NAP", () => {
    const impact = cutImpact(network, "FR-01");
    expect(napIds("FR-01")).toEqual(["NAP-01"]);
    expect(subIds("FR-01")).toEqual(["SUB-001", "SUB-002", "SUB-003"]);
    expect(impact.counts).toEqual({ naps: 1, subscribers: 3, runs: 0 });
  });

  test("(e) losing NAP-04: the NAP is the cut element and FR-04 stays lit", () => {
    const impact = cutImpact(network, "NAP-04");
    expect(impact.element.kind).toBe("nap");
    expect(impact.element.id).toBe("NAP-04");
    expect(napIds("NAP-04")).toEqual(["NAP-04", "NAP-09"]);
    expect(impact.runs_out_of_service).not.toContain("FR-04");
    expect(impact.runs_out_of_service).toContain("FR-09");
  });

  test("(f) FR-04 and NAP-04 list the same NAPs and subscribers", () => {
    const run = cutImpact(network, "FR-04");
    const nap = cutImpact(network, "NAP-04");
    expect(run.element.kind).toBe("run");
    expect(nap.element.kind).toBe("nap");
    expect(run.naps_out_of_service).toEqual(nap.naps_out_of_service);
    expect(run.subscribers_out_of_service).toEqual(nap.subscribers_out_of_service);
  });

  test("(g) a cut at the OLT is refused", () => {
    expect(() => cutImpact(network, network.olt.id)).toThrow("A cut at the OLT is not supported");
  });

  test("(h) an unknown element is refused, naming it", () => {
    expect(() => cutImpact(network, "FR-99")).toThrow(/FR-99/);
  });

  test("(i) all 24 elements equal the hand-derived oracle", () => {
    const ids = [...network.fiber_runs.map((r) => r.id), ...network.splitters.map((n) => n.id)];
    expect(ids).toHaveLength(24);
    expect(Object.keys(oracle.elements).sort()).toEqual([...ids].sort());

    for (const id of ids) {
      const expected = oracle.elements[id];
      const actual = cutImpact(network, id);
      expect(actual.element.kind, id).toBe(expected.kind);
      expect(actual.naps_out_of_service.map((n) => n.id), id).toEqual(expected.naps_out_of_service);
      expect(actual.subscribers_out_of_service.map((s) => s.id), id).toEqual(
        expected.subscribers_out_of_service,
      );
      expect(actual.runs_out_of_service, id).toEqual(expected.runs_out_of_service);
      expect(actual.counts, id).toEqual(expected.counts);
    }
  });

  test("(j) the handoff's values, asserted directly", () => {
    expect(cutImpact(network, "FR-03").counts.subscribers).toBe(5);
    expect(cutImpact(network, "FR-12").counts.subscribers).toBe(4);
    expect(cutImpact(network, "FR-04").counts.subscribers).toBe(5);
  });

  test("(k) a cascade cycle throws rather than looping", () => {
    const cyclic: Network = {
      ...network,
      splitters: network.splitters.map((nap) =>
        nap.id === "NAP-03"
          ? { ...nap, parent: "NAP-12" }
          : nap.id === "NAP-12"
            ? { ...nap, parent: "NAP-03" }
            : nap,
      ),
    };
    expect(() => cutImpact(cyclic, "NAP-03")).toThrow(/cycle/i);
    expect(() => cutImpact(cyclic, "FR-12")).toThrow(/cycle/i);
  });

  test("(l) two calls give deep-equal results", () => {
    expect(cutImpact(network, "FR-03")).toEqual(cutImpact(network, "FR-03"));
  });
});
