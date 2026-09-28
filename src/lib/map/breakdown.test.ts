import { describe, expect, test } from "vitest";

import { formatBreakdown } from "@/lib/map/breakdown";
import { calculateBudget } from "@/lib/optical/budget";
import { loadNetwork } from "@/lib/network/load";

const network = loadNetwork();

describe("2.3 formatBreakdown on the marginal cascade (NAP-12)", () => {
  const result = calculateBudget(network, "NAP-12");
  const formatted = formatBreakdown(result, "Caja Barrio Güiraldes");

  test("two hops, FR-03 at a 1:2 splitter, FR-12 at a 1:16 splitter", () => {
    expect(formatted.hops).toHaveLength(2);
    expect(formatted.hops[0].run_id).toBe("FR-03");
    expect(formatted.hops[0].splitter_ratio).toBe("1:2");
    expect(formatted.hops[0].splitter_db).toBe("3.50");
    expect(formatted.hops[1].run_id).toBe("FR-12");
    expect(formatted.hops[1].splitter_ratio).toBe("1:16");
    expect(formatted.hops[1].splitter_db).toBe("13.50");
  });

  test("by-source totals: fiber 4.95, splitters 17.00, connectors 2.40, splices 0.88", () => {
    expect(formatted.by_source.fiber_db).toBe("4.95");
    expect(formatted.by_source.splitters_db).toBe("17.00");
    expect(formatted.by_source.connectors_db).toBe("2.40");
    expect(formatted.by_source.splices_db).toBe("0.88");
  });

  test("total 25.23 against a 28.00 budget, margin 2.77, marginal", () => {
    expect(formatted.total_loss_db).toBe("25.23");
    expect(formatted.budget_db).toBe("28.00");
    expect(formatted.margin_db).toBe("2.77");
    expect(formatted.status).toBe("marginal");
  });
});

describe("2.3 formatBreakdown on the failing link (NAP-09)", () => {
  test("total 29.40, margin -1.40, fail", () => {
    const result = calculateBudget(network, "NAP-09");
    const formatted = formatBreakdown(result, "Barrio Los Silos");

    expect(formatted.total_loss_db).toBe("29.40");
    expect(formatted.margin_db).toBe("-1.40");
    expect(formatted.status).toBe("fail");
  });
});

describe("2.3 formatBreakdown on a passing NAP (NAP-03)", () => {
  test("total 7.98, margin 20.02, pass", () => {
    const result = calculateBudget(network, "NAP-03");
    const formatted = formatBreakdown(result, "Villa Don Andrés");

    expect(formatted.total_loss_db).toBe("7.98");
    expect(formatted.margin_db).toBe("20.02");
    expect(formatted.status).toBe("pass");
  });
});

describe("2.3 no figure differs from the BudgetResult it was given", () => {
  test.each(["NAP-01", "NAP-03", "NAP-09", "NAP-12"])("%s: every numeric string is value.toFixed(2)", (napId) => {
    const result = calculateBudget(network, napId);
    const formatted = formatBreakdown(result, "any name");

    expect(formatted.total_loss_db).toBe(result.total_loss_db.toFixed(2));
    expect(formatted.budget_db).toBe(result.budget_db.toFixed(2));
    expect(formatted.margin_db).toBe(result.margin_db.toFixed(2));
    expect(formatted.by_source.fiber_db).toBe(result.by_source.fiber_db.toFixed(2));
    expect(formatted.by_source.splitters_db).toBe(result.by_source.splitters_db.toFixed(2));
    expect(formatted.by_source.connectors_db).toBe(result.by_source.connectors_db.toFixed(2));
    expect(formatted.by_source.splices_db).toBe(result.by_source.splices_db.toFixed(2));

    formatted.hops.forEach((hopRow, index) => {
      const hop = result.hops[index];
      expect(hopRow.length_km).toBe(hop.length_km.toFixed(2));
      expect(hopRow.fiber_db).toBe(hop.fiber_db.toFixed(2));
      expect(hopRow.splitter_db).toBe(hop.splitter.loss_db.toFixed(2));
      expect(hopRow.connectors).toBe(hop.connectors);
      expect(hopRow.connectors_db).toBe(hop.connectors_db.toFixed(2));
      expect(hopRow.splices).toBe(hop.splices);
      expect(hopRow.splices_db).toBe(hop.splices_db.toFixed(2));
    });
  });
});
