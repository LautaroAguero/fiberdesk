import { describe, expect, test } from "vitest";

import { isImpactStatus, worseStatus, type HighlightStatus } from "@/lib/optical/status";

const ORDER: HighlightStatus[] = ["pass", "marginal", "fail", "out_of_service", "cut"];

describe("2.1 the shared severity order", () => {
  test("the full order is pass < marginal < fail < out_of_service < cut", () => {
    for (let i = 0; i < ORDER.length; i++) {
      for (let j = 0; j < ORDER.length; j++) {
        const expected = ORDER[Math.max(i, j)];
        expect(worseStatus(ORDER[i], ORDER[j])).toBe(expected);
      }
    }
  });

  test("mixed pairs: a classification never outranks an outage", () => {
    expect(worseStatus<HighlightStatus>("marginal", "cut")).toBe("cut");
    expect(worseStatus<HighlightStatus>("cut", "marginal")).toBe("cut");
    expect(worseStatus<HighlightStatus>("fail", "out_of_service")).toBe("out_of_service");
    expect(worseStatus<HighlightStatus>("out_of_service", "cut")).toBe("cut");
    expect(worseStatus<HighlightStatus>("pass", "fail")).toBe("fail");
  });

  test("only cut and out_of_service are impact statuses", () => {
    expect(ORDER.filter(isImpactStatus)).toEqual(["out_of_service", "cut"]);
  });
});
