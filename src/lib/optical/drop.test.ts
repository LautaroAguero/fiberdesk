import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { loadNetwork } from "@/lib/network/load";
import { calculateBudget } from "@/lib/optical/budget";
import { modelDrop, projectLink } from "@/lib/optical/drop";
import { traceSubscriber } from "@/lib/optical/trace";

const network = loadNetwork();

function lookup() {
  const sub = network.subscribers.find((s) => s.id === "SUB-025");
  const nap = network.splitters.find((n) => n.id === "NAP-12");
  if (sub === undefined || nap === undefined) throw new Error("seed changed");
  return { sub, nap };
}

describe("1.1 the shared drop model", () => {
  test("SUB-025's drop: 0.383 km, 0.498 km, 0.12 + 0.80 = 0.92 dB", () => {
    const { sub, nap } = lookup();
    const drop = modelDrop(nap, sub);

    expect(drop.straight_line_km).toBe(0.383);
    expect(drop.length_km).toBe(0.498);
    expect(drop.fiber_db).toBe(0.12);
    expect(drop.connectors_db).toBe(0.8);
    expect(drop.loss_db).toBe(0.92);
  });

  test("the drop is identical to the one in SUB-025's trace", () => {
    const { sub, nap } = lookup();

    expect(modelDrop(nap, sub)).toEqual(traceSubscriber(network, "SUB-025").drop);
  });

  test("projectLink reproduces SUB-025's link from the NAP budget and the drop", () => {
    const { sub, nap } = lookup();
    const trace = traceSubscriber(network, "SUB-025");
    const link = projectLink(calculateBudget(network, "NAP-12"), modelDrop(nap, sub));

    expect(link.total_loss_db).toBe(26.15);
    expect(link.margin_db).toBe(1.85);
    expect(link.status).toBe("marginal");
    expect(link.by_source).toEqual(trace.by_source);
  });

  test("drop.ts contains no literal loss figure", () => {
    const source = readFileSync(path.join(process.cwd(), "src", "lib", "optical", "drop.ts"), "utf8");
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
      .replace(/"[^"]*"/g, '""');

    // The only numeric literals allowed are the 100/1000 rounding scales and 0.
    const literals = (code.match(/\b\d+(?:\.\d+)?\b/g) ?? []).filter(
      (n) => !["0", "100", "1000"].includes(n),
    );
    expect(literals).toEqual([]);
  });
});
