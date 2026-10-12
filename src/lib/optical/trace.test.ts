import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { loadNetwork } from "@/lib/network/load";
import { calculateBudget } from "@/lib/optical/budget";
import { traceSubscriber } from "@/lib/optical/trace";

interface ExpectedTrace {
  nap_id: string;
  straight_line_km: number;
  length_km: number;
  drop_fiber_db: number;
  drop_connectors_db: number;
  drop_loss_db: number;
  total_loss_db: number;
  margin_db: number;
  status: "pass" | "marginal" | "fail";
  rx_power_dbm: number;
  nap_status: "pass" | "marginal" | "fail";
}

const network = loadNetwork();
const oracle: { subscribers: Record<string, ExpectedTrace> } = JSON.parse(
  readFileSync(path.join(process.cwd(), "seed", "expected-traces.json"), "utf8"),
);

/** Every object key in a JSON-serialisable value, at any depth. */
function allKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(allKeys);
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, inner]) => [key, ...allKeys(inner)]);
  }
  return [];
}

describe("1.5 the subscriber link budget", () => {
  test("(a) a cascaded subscriber: the NAP part is NAP-12's own budget", () => {
    const trace = traceSubscriber(network, "SUB-025");

    expect(trace.nap).toEqual(calculateBudget(network, "NAP-12"));
    expect(trace.nap.hops.map((h) => h.run_id)).toEqual(["FR-03", "FR-12"]);
    expect(trace.by_source).toEqual({
      fiber_db: 5.07,
      splitters_db: 17.0,
      connectors_db: 3.2,
      splices_db: 0.88,
    });
    expect(trace.total_loss_db).toBe(26.15);
    expect(trace.margin_db).toBe(1.85);
    expect(trace.status).toBe("marginal");
  });

  test("(b) a subscriber served directly from the OLT", () => {
    const trace = traceSubscriber(network, "SUB-014");

    expect(trace.nap.hops.map((h) => h.run_id)).toEqual(["FR-07"]);
    expect(trace.nap.total_loss_db).toBe(15.68);
    expect(trace.total_loss_db).toBe(16.6);
    expect(trace.margin_db).toBe(11.4);
    expect(trace.status).toBe("pass");
  });

  test("(c) a subscriber on the failing NAP", () => {
    const trace = traceSubscriber(network, "SUB-018");

    expect(trace.total_loss_db).toBe(30.32);
    expect(trace.margin_db).toBe(-2.32);
    expect(trace.status).toBe("fail");
  });

  test("(d) the drop of SUB-025", () => {
    const { drop } = traceSubscriber(network, "SUB-025");

    expect(drop.straight_line_km).toBe(0.383);
    expect(drop.slack_factor).toBe(1.3);
    expect(drop.length_km).toBe(0.498);
    expect(drop.fiber_db).toBe(0.12);
    expect(drop.connectors).toBe(2);
    expect(drop.connectors_db).toBe(0.8);
    expect(drop.loss_db).toBe(0.92);
  });

  test("(e) a shorter drop: SUB-026", () => {
    const trace = traceSubscriber(network, "SUB-026");

    expect(trace.drop.length_km).toBe(0.458);
    expect(trace.drop.loss_db).toBe(0.91);
    expect(trace.total_loss_db).toBe(26.14);
    expect(trace.margin_db).toBe(1.86);
  });

  test("(f) a passing NAP with a marginal subscriber: SUB-011", () => {
    const trace = traceSubscriber(network, "SUB-011");

    expect(trace.nap.status).toBe("pass");
    expect(trace.nap.margin_db).toBe(3.44);
    expect(trace.total_loss_db).toBe(25.48);
    expect(trace.margin_db).toBe(2.52);
    expect(trace.status).toBe("marginal");
  });

  test("(g) received power is an estimate, with no sensitivity or verdict field", () => {
    const trace = traceSubscriber(network, "SUB-025");

    expect(trace.rx_power_dbm).toBe(-23.15);
    for (const key of allKeys(trace)) {
      expect(key).not.toMatch(/sensitiv|verdict|work|decod/);
    }
  });

  test("(h) an unknown subscriber throws, naming it", () => {
    expect(() => traceSubscriber(network, "SUB-099")).toThrow(/SUB-099/);
  });

  test("(i) all 28 subscribers equal the committed oracle field by field", () => {
    expect(network.subscribers).toHaveLength(28);
    expect(Object.keys(oracle.subscribers).sort()).toEqual(
      network.subscribers.map((s) => s.id).sort(),
    );

    for (const sub of network.subscribers) {
      const expected = oracle.subscribers[sub.id];
      const actual = traceSubscriber(network, sub.id);

      expect(actual.nap_id, sub.id).toBe(expected.nap_id);
      expect(actual.drop.straight_line_km, sub.id).toBe(expected.straight_line_km);
      expect(actual.drop.length_km, sub.id).toBe(expected.length_km);
      expect(actual.drop.fiber_db, sub.id).toBe(expected.drop_fiber_db);
      expect(actual.drop.connectors_db, sub.id).toBe(expected.drop_connectors_db);
      expect(actual.drop.loss_db, sub.id).toBe(expected.drop_loss_db);
      expect(actual.total_loss_db, sub.id).toBe(expected.total_loss_db);
      expect(actual.margin_db, sub.id).toBe(expected.margin_db);
      expect(actual.status, sub.id).toBe(expected.status);
      expect(actual.rx_power_dbm, sub.id).toBe(expected.rx_power_dbm);
      expect(actual.nap.status, sub.id).toBe(expected.nap_status);
    }
  });

  test("exactly SUB-011, SUB-012 and SUB-013 differ from their NAP's status", () => {
    const differing = network.subscribers
      .map((s) => traceSubscriber(network, s.id))
      .filter((t) => t.status !== t.nap.status)
      .map((t) => t.subscriber_id);

    expect(differing).toEqual(["SUB-011", "SUB-012", "SUB-013"]);
  });

  test("(j) two calls give deep-equal results", () => {
    expect(traceSubscriber(network, "SUB-025")).toEqual(traceSubscriber(network, "SUB-025"));
  });
});
