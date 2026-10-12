import { describe, expect, test } from "vitest";

import type { HighlightPayload } from "@/lib/assistant/events";
import { clearsOnNewPoint, pointFromClick } from "@/lib/map/point";

const feasibility: HighlightPayload = {
  highlight: [
    { kind: "point", id: "selected-point", lat: -27.4659, lon: -58.97, best_nap_id: "NAP-11" },
    { kind: "candidate", id: "NAP-11", rank: 1, feasibility: "feasible" },
  ],
  fit_bounds: true,
};

const cut: HighlightPayload = {
  highlight: [
    { kind: "run", id: "FR-03", status: "cut" },
    { kind: "nap", id: "NAP-03", status: "out_of_service" },
  ],
  fit_bounds: true,
};

describe("4.2 does a new point clear this payload?", () => {
  test("a payload with a point entry is cleared", () => {
    expect(clearsOnNewPoint(feasibility)).toBe(true);
  });

  test("a payload without one is kept", () => {
    expect(clearsOnNewPoint(cut)).toBe(false);
  });

  test("no payload at all has nothing to clear", () => {
    expect(clearsOnNewPoint(null)).toBe(false);
  });
});

describe("4.2 what a map click selects", () => {
  test("empty space inside the city selects that location", () => {
    expect(pointFromClick({ lat: -27.4659, lon: -58.97 }, false)).toEqual({ lat: -27.4659, lon: -58.97 });
  });

  test("a click that hit a NAP selects nothing", () => {
    expect(pointFromClick({ lat: -27.4659, lon: -58.97 }, true)).toBeNull();
  });

  test("a click outside the city selects nothing", () => {
    expect(pointFromClick({ lat: -34.6037, lon: -58.3816 }, false)).toBeNull();
  });
});
