/**
 * Tripwire: the constants module must agree, value for value, with the frozen
 * `loss_model` in `seed/expected-budgets.json`. That fixture was derived by
 * hand before this module existed, and every scenario in the spec is stated in
 * its terms. If a constant here ever changes, this test fails loudly — on
 * purpose. See design.md, decision 5.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import {
  CONNECTOR_DB,
  FIBER_DB_PER_KM,
  GPON_CLASS,
  MIN_MARGIN_DB,
  SPLICE_DB,
  SPLITTER_DB,
} from "@/lib/optical/constants";

interface ExpectedBudgetsFixture {
  gpon_class: string;
  budget_db: number;
  min_margin_db: number;
  loss_model: {
    fiber_db_per_km: number;
    connector_db: number;
    splice_db: number;
    splitter_db: Record<string, number>;
  };
}

const fixture: ExpectedBudgetsFixture = JSON.parse(
  readFileSync(path.join(process.cwd(), "seed", "expected-budgets.json"), "utf8"),
);

describe("1.3 the constants module matches the frozen fixture", () => {
  test("fiber attenuation per kilometre", () => {
    expect(FIBER_DB_PER_KM).toBe(fixture.loss_model.fiber_db_per_km);
  });

  test("connector loss", () => {
    expect(CONNECTOR_DB).toBe(fixture.loss_model.connector_db);
  });

  test("splice loss", () => {
    expect(SPLICE_DB).toBe(fixture.loss_model.splice_db);
  });

  test("splitter loss for every ratio in the fixture", () => {
    expect(SPLITTER_DB).toEqual(fixture.loss_model.splitter_db);
  });

  test("the fixture's GPON class budget matches this module's", () => {
    const gponClass = fixture.gpon_class as keyof typeof GPON_CLASS;
    expect(GPON_CLASS[gponClass].budget_db).toBe(fixture.budget_db);
  });

  test("the recommended minimum margin", () => {
    expect(MIN_MARGIN_DB).toBe(fixture.min_margin_db);
  });
});
