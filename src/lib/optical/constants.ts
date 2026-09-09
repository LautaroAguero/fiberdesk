/**
 * Optical constants for the GPON link budget.
 *
 * Every loss value the engine uses lives here, and nowhere else. This is
 * deliberate: an optical constant below is industry-typical and PENDING
 * VALIDATION against real specifications, so changing one has to be a visible
 * edit to this file — reviewable through the project's spec workflow — rather
 * than a literal buried inside a calculation.
 *
 * `seed/expected-budgets.json` carries its own frozen copy of the values below,
 * captured as a fixture before this module existed. The two are compared in
 * `constants.test.ts`: if they ever disagree, either this module drifted from
 * the committed fixture, or the fixture is what needs updating. See design.md,
 * decision 5.
 */

import type { GponClass, SplitterRatio } from "@/lib/network/types";

/**
 * Fiber attenuation at 1490 nm — the GPON *downstream* wavelength — in dB per
 * kilometre of route length. Upstream (1310 nm) attenuates differently and is
 * not modelled; this constant must not be reused for that direction.
 *
 * Source: project brief (industry-typical, pending validation).
 */
export const FIBER_DB_PER_KM = 0.25;

/** Insertion loss of one connectorised mating pair, in dB. Pending validation. */
export const CONNECTOR_DB = 0.4;

/** Insertion loss of one fusion splice, in dB. Pending validation. */
export const SPLICE_DB = 0.08;

/**
 * Insertion loss of a splitter, in dB, keyed by its split ratio. Pending
 * validation.
 */
export const SPLITTER_DB: Record<SplitterRatio, number> = {
  "1:2": 3.5,
  "1:4": 7.2,
  "1:8": 10.5,
  "1:16": 13.5,
  "1:32": 17.0,
};

/**
 * Per-GPON-class link budget, in dB. An object rather than a bare number so a
 * second per-class figure — receiver sensitivity, say — is additive later
 * rather than a change to every call site. No such figure is added here: no
 * sourced value exists in the project, and an unfounded number beside these
 * would be indistinguishable from one that has a provenance.
 *
 * Source: project brief (industry-typical, pending validation).
 */
export const GPON_CLASS: Record<GponClass, { budget_db: number }> = {
  "B+": { budget_db: 28.0 },
  "C+": { budget_db: 32.0 },
};

/**
 * Recommended minimum margin, in dB, that a link should keep above its GPON
 * class budget.
 *
 * Unlike everything above, this is NOT a physical constant — it is an
 * operational recommendation an operator could reasonably set higher or lower.
 * It is kept in this module for convenience but is visibly separate, and every
 * call site that uses it accepts an override rather than being locked to it.
 */
export const MIN_MARGIN_DB = 3.0;
