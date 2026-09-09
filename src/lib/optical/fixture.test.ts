/**
 * Acceptance test: the engine must reproduce `seed/expected-budgets.json`
 * exactly, for every NAP. That fixture was derived by hand before this engine
 * existed — see design.md, decision 5 — and this is the test that makes it an
 * executable check rather than a document.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { calculateAllBudgets } from "@/lib/optical/budget";
import { loadNetwork } from "@/lib/network/load";

interface ExpectedNap {
  fiber_db: number;
  splitters_db: number;
  connectors_db: number;
  splices_db: number;
  total_db: number;
  margin_db: number;
  status: "pass" | "marginal" | "fail";
}

interface Fixture {
  naps: Record<string, ExpectedNap>;
}

const network = loadNetwork();
const fixture: Fixture = JSON.parse(
  readFileSync(path.join(process.cwd(), "seed", "expected-budgets.json"), "utf8"),
);

describe("7.2 the engine reproduces the committed fixture", () => {
  const results = calculateAllBudgets(network);

  test("the fixture covers every NAP the engine computed", () => {
    expect(Object.keys(fixture.naps).sort()).toEqual(results.map((r) => r.nap_id).sort());
  });

  test.each(Object.keys(fixture.naps))("%s matches the fixture exactly", (napId) => {
    const actual = results.find((r) => r.nap_id === napId)!;
    const expected = fixture.naps[napId];

    expect(actual.by_source.fiber_db).toBe(expected.fiber_db);
    expect(actual.by_source.splitters_db).toBe(expected.splitters_db);
    expect(actual.by_source.connectors_db).toBe(expected.connectors_db);
    expect(actual.by_source.splices_db).toBe(expected.splices_db);
    expect(actual.total_loss_db).toBe(expected.total_db);
    expect(actual.margin_db).toBe(expected.margin_db);
    expect(actual.status).toBe(expected.status);
  });
});
