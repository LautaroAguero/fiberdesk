import { describe, expect, test } from "vitest";

import { loadNetwork, parseNetwork, SEED_PATH } from "@/lib/network/load";
import { NetworkValidationError } from "@/lib/network/validate";

describe("loading the seed", () => {
  test("the committed seed loads and satisfies every rule", () => {
    const network = loadNetwork();

    expect(network.olt.id).toBe("OLT-RES-01");
    expect(network.splitters).toHaveLength(12);
    expect(network.fiber_runs).toHaveLength(12);
    expect(network.subscribers.length).toBeGreaterThanOrEqual(20);
  });

  test("the seed is read from the project root, not bundled as a module", () => {
    expect(SEED_PATH.replace(/\\/g, "/")).toMatch(/\/seed\/network\.json$/);
  });

  test("a missing seed file surfaces the filesystem error", () => {
    expect(() => loadNetwork("does-not-exist.json")).toThrow();
  });
});

describe("failing loudly", () => {
  test("malformed JSON is reported as such", () => {
    expect(() => parseNetwork("{ not json")).toThrow(/not valid JSON/);
  });

  test("a structurally invalid dataset throws instead of returning a partial network", () => {
    const raw = JSON.stringify({
      olt: {
        id: "OLT-1",
        name: "Head End",
        lat: -27.4512,
        lon: -58.9866,
        tx_power_dbm: 3,
        gpon_class: "B+",
      },
      splitters: [
        { id: "NAP-A", name: "A", lat: -27.44, lon: -58.98, ratio: "1:8", parent: "NAP-GHOST" },
      ],
      fiber_runs: [],
      subscribers: [],
    });

    let returned: unknown = "sentinel";
    expect(() => {
      returned = parseNetwork(raw);
    }).toThrow(NetworkValidationError);

    // Nothing was handed back: the caller cannot accidentally use a half-built network.
    expect(returned).toBe("sentinel");
  });

  test("the error names the offending entity", () => {
    const raw = JSON.stringify({
      olt: {
        id: "OLT-1",
        name: "Head End",
        lat: -27.4512,
        lon: -58.9866,
        tx_power_dbm: 3,
        gpon_class: "B+",
      },
      splitters: [
        { id: "NAP-A", name: "A", lat: -27.44, lon: -58.98, ratio: "1:64", parent: "OLT-1" },
      ],
      fiber_runs: [],
      subscribers: [],
    });

    expect(() => parseNetwork(raw)).toThrow(/NAP-A/);
  });
});
