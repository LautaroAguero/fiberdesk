/**
 * Reads the seed network from disk.
 *
 * Server-side only. The seed is deliberately not imported as a module: a JSON
 * import that ever reaches a client component would ship the whole network into
 * the browser bundle.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import type { Network } from "@/lib/network/types";
import { assertValidNetwork } from "@/lib/network/validate";

/** Location of the seed, relative to the project root. */
export const SEED_PATH = path.join(process.cwd(), "seed", "network.json");

/** Parses and validates a raw JSON document. Throws unless it is a valid network. */
export function parseNetwork(raw: string): Network {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Network dataset is not valid JSON: ${(error as Error).message}`);
  }

  assertValidNetwork(data);
  return data;
}

/**
 * Reads, parses and validates the seed. Either returns a network that satisfies
 * every rule, or throws — never a partially loaded one.
 */
export function loadNetwork(seedPath: string = SEED_PATH): Network {
  return parseNetwork(readFileSync(seedPath, "utf8"));
}
