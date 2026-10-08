import { describe, expect, test } from "vitest";

import { extractNumbers, numbersInValue, NumberSet } from "@/lib/evals/numbers";

const readings = (text: string) => extractNumbers(text).map((token) => token.readings);

describe("extractNumbers", () => {
  test("Spanish decimal comma, a unicode minus, identifiers and a ratio", () => {
    expect(readings("NAP-09: margen −1,40 dB; NAP-12 2.77 dB, splitter 1:16")).toEqual([[-1.4], [2.77]]);
  });

  test("a line-start list marker is not a figure", () => {
    expect(readings("1. Primero\n2) Segundo")).toEqual([]);
    expect(readings("- 3. tercero")).toEqual([]);
  });

  test("an ambiguous separator keeps both readings", () => {
    expect(readings("1.650 tokens")).toEqual([[1.65, 1650]]);
    expect(readings("1,650 tokens")).toEqual([[1.65, 1650]]);
  });

  test("identifiers of every kind are skipped", () => {
    expect(readings("FR-03, OLT-RES-01 and SUB-014")).toEqual([]);
  });

  test("a wavelength is a figure like any other", () => {
    expect(readings("1490 nm")).toEqual([[1490]]);
  });

  test("units glued to a figure, and an ASCII minus", () => {
    expect(readings("-26.40dBm")).toEqual([[-26.4]]);
  });

  test("a hyphenated range does not make its right side negative", () => {
    expect(readings("0.22-0.25 dB/km")).toEqual([[0.22], [0.25]]);
  });

  test("mixed separators read the last one as the decimal point", () => {
    expect(readings("1.234,5")).toEqual([[1234.5]]);
  });

  test("a sentence-ending period is not a decimal point", () => {
    expect(readings("margin 2.77.")).toEqual([[2.77]]);
  });
});

describe("numbersInValue", () => {
  test("JSON numbers at any depth, signs kept", () => {
    expect(numbersInValue({ margin_db: -1.4, hops: [{ length_km: 12 }, { length_km: 8.8 }] })).toEqual([
      -1.4, 12, 8.8,
    ]);
  });

  test("figures inside search_result text blocks", () => {
    const result = [
      {
        type: "search_result",
        source: "gpon-link-budget.md",
        title: "GPON link budget",
        content: [{ type: "text", text: "commonly modeled at 0.22 dB per kilometer (1490 nm)" }],
      },
    ];
    expect(numbersInValue(result)).toEqual([0.22, 1490]);
  });

  test("a user's message", () => {
    expect(numbersInValue("¿qué cajas quedan por debajo de 4 dB de margen?")).toEqual([4]);
  });
});

describe("NumberSet", () => {
  test("compares by value, tolerant of float noise", () => {
    const set = new NumberSet([0.1 + 0.2, -1.4]);
    expect(set.has(0.3)).toBe(true);
    expect(set.has(-1.4)).toBe(true);
    expect(set.has(1.4)).toBe(false);
    expect(set.hasAbs(1.4)).toBe(true);
  });
});
