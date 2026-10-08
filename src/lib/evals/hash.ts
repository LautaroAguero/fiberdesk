/**
 * Stable hashing of JSON-shaped values: object keys are sorted recursively
 * first, so the hash does not depend on key order.
 */

import { createHash } from "node:crypto";

/** `value` with every object's keys sorted, recursively. */
export function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/** SHA-256, hex, of the canonical JSON of `value`. */
export function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
