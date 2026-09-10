import { describe, expect, test } from "vitest";

import { detailOpticalBudget, summarizeOpticalBudgets } from "@/lib/assistant/budgets";
import { loadNetwork } from "@/lib/network/load";

const network = loadNetwork();

describe("2.1 summarizeOpticalBudgets", () => {
  test("returns one row per NAP, 12 in total", () => {
    expect(summarizeOpticalBudgets(network)).toHaveLength(12);
  });

  test("NAP-09 reads 29.40 / -1.40 / fail", () => {
    const row = summarizeOpticalBudgets(network).find((r) => r.nap_id === "NAP-09");
    expect(row).toMatchObject({ total_loss_db: 29.4, margin_db: -1.4, status: "fail" });
  });

  test("NAP-12 reads 25.23 / 2.77 / marginal", () => {
    const row = summarizeOpticalBudgets(network).find((r) => r.nap_id === "NAP-12");
    expect(row).toMatchObject({ total_loss_db: 25.23, margin_db: 2.77, status: "marginal" });
  });

  test("the other ten NAPs read pass", () => {
    const rows = summarizeOpticalBudgets(network).filter(
      (r) => r.nap_id !== "NAP-09" && r.nap_id !== "NAP-12",
    );
    expect(rows).toHaveLength(10);
    for (const row of rows) expect(row.status).toBe("pass");
  });

  test("each row carries the name a technician would use", () => {
    const row = summarizeOpticalBudgets(network).find((r) => r.nap_id === "NAP-12");
    expect(row?.name).toBe("Barrio Güiraldes");
  });
});

describe("2.2 the minimum margin override passes through", () => {
  test("at 5.00 dB, NAP-06 keeps its physics but its status becomes marginal", () => {
    const row = summarizeOpticalBudgets(network, { minMarginDb: 5.0 }).find(
      (r) => r.nap_id === "NAP-06",
    );
    expect(row).toMatchObject({ total_loss_db: 24.56, margin_db: 3.44, status: "marginal" });
  });
});

describe("2.3 detailOpticalBudget", () => {
  test("NAP-12 returns two hops matching the design table", () => {
    const result = detailOpticalBudget(network, "NAP-12");

    expect(result.hops).toHaveLength(2);
    expect(result.hops[0]).toMatchObject({
      run_id: "FR-03",
      fiber_db: 2.8,
      splitter: { at: "NAP-03", ratio: "1:2", loss_db: 3.5 },
    });
    expect(result.hops[1]).toMatchObject({
      run_id: "FR-12",
      fiber_db: 2.15,
      splitter: { at: "NAP-12", ratio: "1:16", loss_db: 13.5 },
    });
  });

  test("NAP-12's by-source totals are 4.95 / 17.00 / 2.40 / 0.88", () => {
    const result = detailOpticalBudget(network, "NAP-12");
    expect(result.by_source).toEqual({
      fiber_db: 4.95,
      splitters_db: 17.0,
      connectors_db: 2.4,
      splices_db: 0.88,
    });
  });
});
