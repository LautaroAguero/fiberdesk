import { describe, expect, test } from "vitest";

import { getOpticalConstantsSnapshot } from "@/lib/assistant/optical-constants";

describe("5.2 the optical constants snapshot", () => {
  test("fiber attenuation reads 0.25 dB/km at 1490 nm downstream", () => {
    const snapshot = getOpticalConstantsSnapshot();
    expect(snapshot.fiber_attenuation).toMatchObject({
      value: 0.25,
      unit: "dB/km",
      wavelength_nm: 1490,
      direction: "downstream",
    });
  });

  test("a fusion splice reads 0.08 dB", () => {
    const snapshot = getOpticalConstantsSnapshot();
    expect(snapshot.splice_loss).toMatchObject({ value: 0.08, unit: "dB" });
  });

  test("every physical constant carries the pending-validation marker", () => {
    const snapshot = getOpticalConstantsSnapshot();
    expect(snapshot.fiber_attenuation.status).toBe("industry_typical_pending_validation");
    expect(snapshot.connector_loss.status).toBe("industry_typical_pending_validation");
    expect(snapshot.splice_loss.status).toBe("industry_typical_pending_validation");
    expect(snapshot.splitter_insertion_loss["1:16"].status).toBe("industry_typical_pending_validation");
    expect(snapshot.gpon_class_budget["B+"].status).toBe("industry_typical_pending_validation");
  });

  test("the minimum margin is labelled as a recommendation, not a physical constant", () => {
    const snapshot = getOpticalConstantsSnapshot();
    expect(snapshot.min_recommended_margin).toMatchObject({
      value: 3.0,
      unit: "dB",
      status: "operational_recommendation",
    });
  });

  test("splitter insertion loss covers every supported ratio", () => {
    const snapshot = getOpticalConstantsSnapshot();
    expect(Object.keys(snapshot.splitter_insertion_loss).sort()).toEqual([
      "1:16",
      "1:2",
      "1:32",
      "1:4",
      "1:8",
    ]);
  });

  test("gpon class budgets cover B+ and C+", () => {
    const snapshot = getOpticalConstantsSnapshot();
    expect(snapshot.gpon_class_budget["B+"].value).toBe(28.0);
    expect(snapshot.gpon_class_budget["C+"].value).toBe(32.0);
  });
});
