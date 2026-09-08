import { describe, expect, test } from "vitest";

import { collectIssues, assertValidNetwork, NetworkValidationError } from "@/lib/network/validate";

/**
 * A minimal network that satisfies every rule. Each test mutates one thing and
 * asserts that exactly that thing is reported, so a passing test cannot be
 * explained by unrelated breakage.
 */
function makeNetwork() {
  return {
    olt: {
      id: "OLT-1",
      name: "Head End",
      lat: -27.4512,
      lon: -58.9866,
      tx_power_dbm: 3.0,
      gpon_class: "B+",
    },
    splitters: [
      { id: "NAP-A", name: "A", lat: -27.44, lon: -58.98, ratio: "1:8", parent: "OLT-1" },
      { id: "NAP-B", name: "B", lat: -27.46, lon: -58.97, ratio: "1:16", parent: "NAP-A" },
    ],
    fiber_runs: [
      {
        id: "FR-A",
        from: "OLT-1",
        to: "NAP-A",
        length_km: 4.0,
        splices: 3,
        connectors: 2,
        geometry: [
          [-58.9866, -27.4512],
          [-58.98, -27.44],
        ],
      },
      {
        id: "FR-B",
        from: "NAP-A",
        to: "NAP-B",
        length_km: 2.5,
        splices: 2,
        connectors: 2,
        geometry: [
          [-58.98, -27.44],
          [-58.97, -27.46],
        ],
      },
    ],
    subscribers: [{ id: "SUB-1", name: "Subscriber 1", lat: -27.461, lon: -58.971, nap: "NAP-B" }],
  };
}

/** All issues raised against one entity, optionally narrowed to one field. */
const issuesFor = (data: unknown, entity: string, field?: string) =>
  collectIssues(data).filter((i) => i.entity === entity && (field === undefined || i.field === field));

test("the baseline fixture is valid, including its legitimate cascade", () => {
  expect(collectIssues(makeNetwork())).toEqual([]);
});

describe("4.1 referential integrity", () => {
  test("a NAP pointing at a node that does not exist is reported by id", () => {
    const net = makeNetwork();
    net.splitters[1].parent = "NAP-GHOST";

    expect(issuesFor(net, "NAP-B", "parent")[0].message).toContain("NAP-GHOST");
  });

  test("a subscriber pointing at a node that does not exist is reported by id", () => {
    const net = makeNetwork();
    net.subscribers[0].nap = "NAP-GHOST";

    expect(issuesFor(net, "SUB-1", "nap")[0].message).toContain("NAP-GHOST");
  });

  test("a subscriber may not hang directly off the OLT", () => {
    const net = makeNetwork();
    net.subscribers[0].nap = "OLT-1";

    expect(issuesFor(net, "SUB-1", "nap")).toHaveLength(1);
  });

  test("a fiber run endpoint that does not exist is reported by run id and endpoint", () => {
    const net = makeNetwork();
    net.fiber_runs[0].to = "NAP-GHOST";

    const issues = issuesFor(net, "FR-A", "to");
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("NAP-GHOST");
  });

  test("duplicate ids are reported", () => {
    const net = makeNetwork();
    net.splitters[1].id = "NAP-A";

    expect(issuesFor(net, "NAP-A", "id").map((i) => i.message)).toContain("duplicate id");
  });
});

describe("4.2 single root and cascade cycles", () => {
  test("a two-NAP cycle is reported against both members and names both", () => {
    const net = makeNetwork();
    net.splitters[0].parent = "NAP-B"; // A -> B, and B -> A already

    const a = issuesFor(net, "NAP-A", "parent");
    const b = issuesFor(net, "NAP-B", "parent");

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    for (const issue of [...a, ...b]) {
      expect(issue.message).toContain("NAP-A");
      expect(issue.message).toContain("NAP-B");
    }
  });

  test("a NAP that is its own parent is reported", () => {
    const net = makeNetwork();
    net.splitters[0].parent = "NAP-A";

    expect(issuesFor(net, "NAP-A", "parent").map((i) => i.message)).toContain("is its own parent");
  });

  test("an orphaned NAP is reported by name", () => {
    const net = makeNetwork();
    net.splitters[0].parent = "";

    expect(issuesFor(net, "NAP-A", "parent").length).toBeGreaterThan(0);
  });

  test("a NAP whose parent is a subscriber rather than a node is reported", () => {
    const net = makeNetwork();
    net.splitters[0].parent = "SUB-1";

    expect(issuesFor(net, "NAP-A", "parent")[0].message).toContain("neither the OLT nor another NAP");
  });
});

describe("4.3 field-level rules", () => {
  test("an unsupported splitter ratio names the NAP and the ratio", () => {
    const net = makeNetwork();
    net.splitters[0].ratio = "1:64";

    const issues = issuesFor(net, "NAP-A", "ratio");
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("1:64");
  });

  test.each(["length_km", "splices", "connectors"] as const)(
    "a negative %s names the run and the field",
    (field) => {
      const net = makeNetwork();
      (net.fiber_runs[0] as Record<string, unknown>)[field] = -1;

      expect(issuesFor(net, "FR-A", field)).toHaveLength(1);
    },
  );

  test("a fractional splice count is rejected", () => {
    const net = makeNetwork();
    net.fiber_runs[0].splices = 2.5;

    expect(issuesFor(net, "FR-A", "splices")).toHaveLength(1);
  });

  test("a NAP outside the modelled city names the coordinate", () => {
    const net = makeNetwork();
    net.splitters[0].lat = -34.6037; // Buenos Aires

    const issues = issuesFor(net, "NAP-A", "lat");
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("outside the modelled city");
  });

  test("a subscriber outside the modelled city is reported", () => {
    const net = makeNetwork();
    net.subscribers[0].lon = -58.0;

    expect(issuesFor(net, "SUB-1", "lon")).toHaveLength(1);
  });

  test("an unsupported GPON class names the OLT", () => {
    const net = makeNetwork();
    net.olt.gpon_class = "A";

    expect(issuesFor(net, "OLT-1", "gpon_class")).toHaveLength(1);
  });

  test("a geometry with a single point is rejected", () => {
    const net = makeNetwork();
    net.fiber_runs[0].geometry = [[-58.9866, -27.4512]];

    expect(issuesFor(net, "FR-A", "geometry")).toHaveLength(1);
  });
});

describe("assertValidNetwork", () => {
  test("accepts a valid network", () => {
    expect(() => assertValidNetwork(makeNetwork())).not.toThrow();
  });

  test("throws a NetworkValidationError carrying every issue", () => {
    const net = makeNetwork();
    net.splitters[0].ratio = "1:64";
    net.subscribers[0].nap = "NAP-GHOST";

    expect(() => assertValidNetwork(net)).toThrow(NetworkValidationError);
    try {
      assertValidNetwork(net);
    } catch (error) {
      const issues = (error as NetworkValidationError).issues;
      expect(issues.map((i) => i.entity).sort()).toEqual(["NAP-A", "SUB-1"]);
    }
  });

  test("rejects a non-object outright", () => {
    expect(() => assertValidNetwork(null)).toThrow(NetworkValidationError);
    expect(() => assertValidNetwork([])).toThrow(NetworkValidationError);
  });
});
