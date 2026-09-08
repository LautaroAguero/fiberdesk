/**
 * The entity contract for the synthetic FTTH network in `seed/network.json`.
 *
 * Every consumer — the optical budget tool and the map — reads these types
 * without transformation. Changing them is a breaking change for both.
 *
 * COORDINATE ORDER — read this before touching geometry:
 * nodes (OLT, NAP, subscriber) carry named `lat` / `lon` fields, so their order
 * is unambiguous. `FiberRun.geometry` instead uses `[lon, lat]` pairs, in GeoJSON
 * order, because that is what map renderers consume unmodified. The mismatch is
 * deliberate; see design.md, decision 4.
 */

/**
 * Splitter ratios the dataset supports, written the way a technician says them.
 * The runtime array is the single source: the type is derived from it, so the
 * validator and the compiler can never disagree about what is supported.
 */
export const SPLITTER_RATIOS = ["1:2", "1:4", "1:8", "1:16", "1:32"] as const;

export type SplitterRatio = (typeof SPLITTER_RATIOS)[number];

/** GPON classes the dataset supports. Each implies a link budget, defined elsewhere. */
export type GponClass = "B+" | "C+";

/** A point on the map. Degrees, WGS 84. */
export interface Position {
  /** Latitude in decimal degrees. Negative in the southern hemisphere. */
  lat: number;
  /** Longitude in decimal degrees. Negative in the western hemisphere. */
  lon: number;
}

/** The head end: the operator's line terminal. Exactly one per dataset. */
export interface Olt extends Position {
  id: string;
  name: string;
  /** Transmit power in dBm. */
  tx_power_dbm: number;
  gpon_class: GponClass;
}

/**
 * A splitter enclosure (NAP). Hangs off the OLT or off another NAP — the latter
 * is a cascade, and cascades are why links go marginal.
 */
export interface Nap extends Position {
  id: string;
  /** Human-readable name, typically the neighbourhood it serves. */
  name: string;
  ratio: SplitterRatio;
  /** Id of the OLT or of the parent NAP this one hangs from. */
  parent: string;
}

/**
 * A span of fiber between two nodes. Carries its own loss contributors, so the
 * total for a link is the sum over the runs along the path — no cumulative
 * values are stored anywhere.
 */
export interface FiberRun {
  id: string;
  /** Id of the upstream node. */
  from: string;
  /** Id of the downstream node. */
  to: string;
  /** Route length in kilometres. Longer than the straight-line distance: fiber follows ducts. */
  length_km: number;
  /** Count of fusion splices along the run. */
  splices: number;
  /** Count of connectors along the run. */
  connectors: number;
  /** Polyline for map rendering, as `[lon, lat]` pairs. See the note at the top of this file. */
  geometry: Array<[number, number]>;
}

/** An end customer's ONT, served by exactly one NAP. */
export interface Subscriber extends Position {
  id: string;
  name: string;
  /** Id of the NAP that serves this subscriber. */
  nap: string;
}

/** The whole network, as loaded from `seed/network.json`. */
export interface Network {
  olt: Olt;
  splitters: Nap[];
  fiber_runs: FiberRun[];
  subscribers: Subscriber[];
}
