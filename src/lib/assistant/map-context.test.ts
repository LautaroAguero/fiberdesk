import { describe, expect, test } from "vitest";

import { parseMapContext } from "@/lib/assistant/map-context";

describe("3.2 the chat request's map context", () => {
  test("a valid selected point is accepted as given", () => {
    const result = parseMapContext({ messages: [], map_context: { selected_point: { lat: -27.4659, lon: -58.97 } } });
    expect(result).toEqual({ ok: true, mapContext: { selected_point: { lat: -27.4659, lon: -58.97 } } });
  });

  test("an older client without map context gets no point", () => {
    expect(parseMapContext({ messages: [] })).toEqual({ ok: true, mapContext: {} });
  });

  test("a map context with no point gets no point", () => {
    expect(parseMapContext({ messages: [], map_context: {} })).toEqual({ ok: true, mapContext: {} });
  });

  test("a point outside the modelled city is refused, saying so", () => {
    const result = parseMapContext({ map_context: { selected_point: { lat: -34.6037, lon: -58.3816 } } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("outside the modelled city");
  });

  test("a non-numeric coordinate is refused", () => {
    const result = parseMapContext({ map_context: { selected_point: { lat: "-27.46", lon: -58.97 } } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("finite numeric");
  });

  test("a NaN coordinate is refused", () => {
    const result = parseMapContext({ map_context: { selected_point: { lat: Number.NaN, lon: -58.97 } } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("finite numeric");
  });

  test("a map context that is not an object is refused", () => {
    const result = parseMapContext({ map_context: "here" });
    expect(result.ok).toBe(false);
  });
});
