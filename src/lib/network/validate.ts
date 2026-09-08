/**
 * Structural validation for the seed network.
 *
 * The dataset is small and hand-maintained, so the failure mode worth defending
 * against is a broken reference or an accidental cascade loop, not a hostile
 * payload. Everything here is a property the whole graph must hold; there is no
 * schema library because none of these are shape checks.
 *
 * Validation is all-or-nothing: callers either get a network that satisfies every
 * rule below, or an error. Nothing is dropped, defaulted or repaired.
 */

import { SPLITTER_RATIOS, type Network, type SplitterRatio } from "@/lib/network/types";

/**
 * Geographic envelope of the modelled city, Resistencia (Chaco, Argentina).
 * Decimal degrees, WGS 84. Anything outside is a data-entry mistake, not a
 * legitimate outlying node — the dataset models one city by design.
 */
export const CITY_BOUNDS = {
  lat_min: -27.5,
  lat_max: -27.4,
  lon_min: -59.05,
  lon_max: -58.93,
} as const;

/** A single rule violation, naming what broke and where. */
export interface ValidationIssue {
  /** Id of the offending entity, or a path when the failure is structural. */
  entity: string;
  /** Offending field, when the failure is attributable to one. */
  field?: string;
  message: string;
}

export class NetworkValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    const detail = issues
      .map((i) => `  ${i.entity}${i.field ? `.${i.field}` : ""}: ${i.message}`)
      .join("\n");
    super(`Network dataset is invalid (${issues.length} issue(s)):\n${detail}`);
    this.name = "NetworkValidationError";
    this.issues = issues;
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const isNonNegativeInteger = (v: unknown): boolean =>
  isFiniteNumber(v) && Number.isInteger(v) && v >= 0;

/** Positioned entities share the same coordinate rules, so they share one check. */
function checkPosition(entity: string, value: Record<string, unknown>, issues: ValidationIssue[]) {
  for (const field of ["lat", "lon"] as const) {
    if (!isFiniteNumber(value[field])) {
      issues.push({ entity, field, message: "must be a finite number" });
    }
  }

  const { lat, lon } = value;
  if (isFiniteNumber(lat) && (lat < CITY_BOUNDS.lat_min || lat > CITY_BOUNDS.lat_max)) {
    issues.push({
      entity,
      field: "lat",
      message: `${lat} is outside the modelled city (${CITY_BOUNDS.lat_min}..${CITY_BOUNDS.lat_max})`,
    });
  }
  if (isFiniteNumber(lon) && (lon < CITY_BOUNDS.lon_min || lon > CITY_BOUNDS.lon_max)) {
    issues.push({
      entity,
      field: "lon",
      message: `${lon} is outside the modelled city (${CITY_BOUNDS.lon_min}..${CITY_BOUNDS.lon_max})`,
    });
  }
}

/**
 * Every rule violation in the dataset, rather than only the first. A malformed
 * seed is usually malformed in several places at once, and reporting them one
 * per run turns a five-minute fix into five rounds.
 */
export function collectIssues(data: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isObject(data)) {
    return [{ entity: "network", message: "must be an object" }];
  }

  for (const key of ["splitters", "fiber_runs", "subscribers"] as const) {
    if (!Array.isArray(data[key])) {
      issues.push({ entity: "network", field: key, message: "must be an array" });
    }
  }
  if (!isObject(data.olt)) {
    issues.push({ entity: "network", field: "olt", message: "must be an object" });
  }
  if (issues.length > 0) return issues;

  const olt = data.olt as Record<string, unknown>;
  const splitters = data.splitters as Record<string, unknown>[];
  const fiberRuns = data.fiber_runs as Record<string, unknown>[];
  const subscribers = data.subscribers as Record<string, unknown>[];

  // --- The head end ---------------------------------------------------------
  const oltId = typeof olt.id === "string" ? olt.id : "<olt>";
  if (typeof olt.id !== "string" || olt.id === "") {
    issues.push({ entity: "<olt>", field: "id", message: "must be a non-empty string" });
  }
  if (!isFiniteNumber(olt.tx_power_dbm)) {
    issues.push({ entity: oltId, field: "tx_power_dbm", message: "must be a finite number" });
  }
  if (olt.gpon_class !== "B+" && olt.gpon_class !== "C+") {
    issues.push({
      entity: oltId,
      field: "gpon_class",
      message: `${JSON.stringify(olt.gpon_class)} is not a supported GPON class (B+, C+)`,
    });
  }
  checkPosition(oltId, olt, issues);

  // --- Splitter enclosures --------------------------------------------------
  const napIds = new Set<string>();
  for (const [index, nap] of splitters.entries()) {
    const id = typeof nap.id === "string" && nap.id !== "" ? nap.id : `splitters[${index}]`;
    if (typeof nap.id !== "string" || nap.id === "") {
      issues.push({ entity: id, field: "id", message: "must be a non-empty string" });
    } else if (napIds.has(nap.id) || nap.id === oltId) {
      issues.push({ entity: id, field: "id", message: "duplicate id" });
    } else {
      napIds.add(nap.id);
    }

    if (!SPLITTER_RATIOS.includes(nap.ratio as SplitterRatio)) {
      issues.push({
        entity: id,
        field: "ratio",
        message: `${JSON.stringify(nap.ratio)} is not a supported splitter ratio (${SPLITTER_RATIOS.join(", ")})`,
      });
    }
    if (typeof nap.parent !== "string" || nap.parent === "") {
      issues.push({ entity: id, field: "parent", message: "must be a non-empty string" });
    }
    checkPosition(id, nap, issues);
  }

  const knownNodes = new Set<string>([oltId, ...napIds]);

  // Parent references, and the tree shape they have to produce.
  for (const nap of splitters) {
    if (typeof nap.id !== "string" || typeof nap.parent !== "string") continue;
    if (!knownNodes.has(nap.parent)) {
      issues.push({
        entity: nap.id,
        field: "parent",
        message: `references unknown node ${JSON.stringify(nap.parent)}; it is neither the OLT nor another NAP`,
      });
    }
    if (nap.parent === nap.id) {
      issues.push({ entity: nap.id, field: "parent", message: "is its own parent" });
    }
  }

  const parentOf = new Map<string, string>();
  for (const nap of splitters) {
    if (typeof nap.id === "string" && typeof nap.parent === "string") {
      parentOf.set(nap.id, nap.parent);
    }
  }

  // Cascades are legitimate; loops are not. Walk each NAP upward and report the
  // whole ring, because naming only one member of a cycle does not locate it.
  const reachesOlt = new Set<string>();
  const reported = new Set<string>();
  for (const startId of parentOf.keys()) {
    const seen = new Set<string>();
    const trail: string[] = [];
    let cursor: string | undefined = startId;

    while (cursor !== undefined && cursor !== oltId && !reachesOlt.has(cursor)) {
      if (seen.has(cursor)) {
        const ring = trail.slice(trail.indexOf(cursor));
        const key = [...ring].sort().join(",");
        if (!reported.has(key)) {
          reported.add(key);
          for (const member of ring) {
            issues.push({
              entity: member,
              field: "parent",
              message: `is part of a cascade cycle: ${ring.join(" -> ")} -> ${ring[0]}`,
            });
          }
        }
        break;
      }
      seen.add(cursor);
      trail.push(cursor);
      cursor = parentOf.get(cursor);
    }

    if (cursor === oltId || (cursor !== undefined && reachesOlt.has(cursor))) {
      for (const id of trail) reachesOlt.add(id);
    }
  }

  for (const id of parentOf.keys()) {
    if (!reachesOlt.has(id) && !issues.some((i) => i.entity === id && i.field === "parent")) {
      issues.push({
        entity: id,
        field: "parent",
        message: "is not reachable from the OLT",
      });
    }
  }

  // --- Fiber runs -----------------------------------------------------------
  const runIds = new Set<string>();
  for (const [index, run] of fiberRuns.entries()) {
    const id = typeof run.id === "string" && run.id !== "" ? run.id : `fiber_runs[${index}]`;
    if (typeof run.id !== "string" || run.id === "") {
      issues.push({ entity: id, field: "id", message: "must be a non-empty string" });
    } else if (runIds.has(run.id)) {
      issues.push({ entity: id, field: "id", message: "duplicate id" });
    } else {
      runIds.add(run.id);
    }

    for (const endpoint of ["from", "to"] as const) {
      const value = run[endpoint];
      if (typeof value !== "string" || !knownNodes.has(value)) {
        issues.push({
          entity: id,
          field: endpoint,
          message: `references unknown node ${JSON.stringify(value)}`,
        });
      }
    }

    if (!isFiniteNumber(run.length_km) || run.length_km < 0) {
      issues.push({
        entity: id,
        field: "length_km",
        message: `${JSON.stringify(run.length_km)} must be a number of kilometres and cannot be negative`,
      });
    }
    for (const field of ["splices", "connectors"] as const) {
      if (!isNonNegativeInteger(run[field])) {
        issues.push({
          entity: id,
          field,
          message: `${JSON.stringify(run[field])} must be a non-negative whole count`,
        });
      }
    }

    if (!Array.isArray(run.geometry) || run.geometry.length < 2) {
      issues.push({
        entity: id,
        field: "geometry",
        message: "must be a polyline of at least two [lon, lat] points",
      });
    } else if (
      !run.geometry.every(
        (p): p is [number, number] =>
          Array.isArray(p) && p.length === 2 && p.every((c) => isFiniteNumber(c)),
      )
    ) {
      issues.push({
        entity: id,
        field: "geometry",
        message: "every point must be a [lon, lat] pair of finite numbers",
      });
    }
  }

  // --- Subscribers ----------------------------------------------------------
  const subscriberIds = new Set<string>();
  for (const [index, sub] of subscribers.entries()) {
    const id = typeof sub.id === "string" && sub.id !== "" ? sub.id : `subscribers[${index}]`;
    if (typeof sub.id !== "string" || sub.id === "") {
      issues.push({ entity: id, field: "id", message: "must be a non-empty string" });
    } else if (subscriberIds.has(sub.id)) {
      issues.push({ entity: id, field: "id", message: "duplicate id" });
    } else {
      subscriberIds.add(sub.id);
    }

    if (typeof sub.nap !== "string" || !napIds.has(sub.nap)) {
      issues.push({
        entity: id,
        field: "nap",
        message: `references unknown NAP ${JSON.stringify(sub.nap)}`,
      });
    }
    checkPosition(id, sub, issues);
  }

  return issues;
}

/** Throws {@link NetworkValidationError} unless every rule holds. */
export function assertValidNetwork(data: unknown): asserts data is Network {
  const issues = collectIssues(data);
  if (issues.length > 0) throw new NetworkValidationError(issues);
}
