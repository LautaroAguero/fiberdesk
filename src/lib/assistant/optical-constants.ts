/**
 * Adapts `@/lib/optical/constants` into a tool-friendly snapshot.
 *
 * This exists so the assistant can compare a documented figure against the
 * value the system actually computes with, without ever dividing a figure
 * back out of a budget breakdown — see design.md, decision 4. Every value
 * carries its unit and its provenance, matching the source file's own
 * distinction between physical constants (industry-typical, pending
 * validation) and the one operational recommendation among them.
 */

import {
  CONNECTOR_DB,
  FIBER_DB_PER_KM,
  GPON_CLASS,
  MIN_MARGIN_DB,
  SPLICE_DB,
  SPLITTER_DB,
} from "@/lib/optical/constants";
import type { GponClass, SplitterRatio } from "@/lib/network/types";

interface ConstantValue {
  value: number;
  unit: string;
  status: "industry_typical_pending_validation" | "operational_recommendation";
}

export interface OpticalConstantsSnapshot {
  fiber_attenuation: ConstantValue & { wavelength_nm: 1490; direction: "downstream" };
  connector_loss: ConstantValue;
  splice_loss: ConstantValue;
  splitter_insertion_loss: Record<SplitterRatio, ConstantValue>;
  gpon_class_budget: Record<GponClass, ConstantValue>;
  min_recommended_margin: ConstantValue;
}

const PENDING = "industry_typical_pending_validation" as const;

/** Returns the project's optical constants, each labelled with unit and provenance. */
export function getOpticalConstantsSnapshot(): OpticalConstantsSnapshot {
  return {
    fiber_attenuation: {
      value: FIBER_DB_PER_KM,
      unit: "dB/km",
      wavelength_nm: 1490,
      direction: "downstream",
      status: PENDING,
    },
    connector_loss: { value: CONNECTOR_DB, unit: "dB", status: PENDING },
    splice_loss: { value: SPLICE_DB, unit: "dB", status: PENDING },
    splitter_insertion_loss: Object.fromEntries(
      Object.entries(SPLITTER_DB).map(([ratio, value]) => [ratio, { value, unit: "dB", status: PENDING }]),
    ) as Record<SplitterRatio, ConstantValue>,
    gpon_class_budget: Object.fromEntries(
      Object.entries(GPON_CLASS).map(([cls, { budget_db }]) => [
        cls,
        { value: budget_db, unit: "dB", status: PENDING },
      ]),
    ) as Record<GponClass, ConstantValue>,
    min_recommended_margin: {
      value: MIN_MARGIN_DB,
      unit: "dB",
      status: "operational_recommendation",
    },
  };
}
