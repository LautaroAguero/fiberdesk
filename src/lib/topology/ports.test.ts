import { describe, expect, test } from "vitest";

import { loadNetwork } from "@/lib/network/load";
import type { Network } from "@/lib/network/types";
import { freePorts } from "@/lib/topology/ports";

const network = loadNetwork();
const ports = freePorts(network);

const free = (id: string) => ports.get(id)?.free;

describe("1.3 free ports", () => {
  test("a full cascade parent, a partly used splitter, a cascade child, an empty one", () => {
    expect(free("NAP-03")).toBe(0);
    expect(free("NAP-10")).toBe(2);
    expect(free("NAP-12")).toBe(12);
    expect(free("NAP-06")).toBe(29);
  });

  test("NAP-03 counts its subscriber and the NAP it feeds", () => {
    expect(ports.get("NAP-03")).toEqual({ outputs: 2, subscribers: 1, child_naps: 1, free: 0 });
  });

  test("the twelve seed values match design.md's Context list", () => {
    expect(Object.fromEntries([...ports].map(([id, p]) => [id, p.free]))).toEqual({
      "NAP-01": 5,
      "NAP-02": 14,
      "NAP-03": 0,
      "NAP-04": 5,
      "NAP-05": 6,
      "NAP-06": 29,
      "NAP-07": 6,
      "NAP-08": 14,
      "NAP-09": 5,
      "NAP-10": 2,
      "NAP-11": 14,
      "NAP-12": 12,
    });
  });

  test("a hand-built 1:2 NAP with two subscribers and a child throws, naming it", () => {
    const extra = network.subscribers.find((s) => s.id === "SUB-006");
    if (extra === undefined) throw new Error("seed changed");
    const oversubscribed: Network = {
      ...network,
      subscribers: [...network.subscribers, { ...extra, id: "SUB-900" }].map((s) =>
        s.id === "SUB-900" ? { ...s, nap: "NAP-03" } : s,
      ),
    };

    expect(() => freePorts(oversubscribed)).toThrow(/NAP-03 is oversubscribed/);
  });
});
