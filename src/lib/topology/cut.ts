/**
 * The impact of a cut: what loses service downstream of one fiber run or one NAP.
 *
 * A pure walk down the `parent` tree. It computes no light, which is why it lives
 * apart from `@/lib/optical/`, and it never leaves the counts to the caller: the
 * lists and their lengths are produced here, in the same function, so a model
 * asked "how many customers?" cites a figure instead of counting a list. No id
 * from the seed appears in this file. See design.md (add-cut-impact), decisions
 * 1, 2 and 3.
 *
 * A cut is total and hypothetical: the element and everything below it lose
 * service, nothing upstream changes, and nothing is written to the network.
 */

import type { Network } from "@/lib/network/types";

/** What a cut of one fiber run or one NAP takes out of service. */
export interface CutImpact {
  element:
    | { kind: "run"; id: string; from: string; to: string }
    | { kind: "nap"; id: string; name: string };
  /** The NAP at the root of the outage and every NAP below it, sorted by id. */
  naps_out_of_service: Array<{ id: string; name: string }>;
  /** Every subscriber served by an out-of-service NAP, sorted by id. */
  subscribers_out_of_service: Array<{ id: string; name: string; nap_id: string }>;
  /** Downstream runs only (their `from` is out of service), never the cut run itself. Sorted. */
  runs_out_of_service: string[];
  /** The list lengths, computed here so no caller has to count. */
  counts: { naps: number; subscribers: number; runs: number };
}

function byId<T extends { id: string }>(a: T, b: T): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Computes what cutting `elementId` takes out of service.
 *
 * The element is a fiber run (the NAP at its far end goes out) or a NAP (it goes
 * out, and its feeder run stays lit). Throws for the OLT, which is not supported,
 * and for any identifier the network does not contain: never an empty, partial or
 * guessed result.
 */
export function cutImpact(network: Network, elementId: string): CutImpact {
  if (elementId === network.olt.id) {
    throw new Error("A cut at the OLT is not supported");
  }

  const napById = new Map(network.splitters.map((nap) => [nap.id, nap]));
  const run = network.fiber_runs.find((candidate) => candidate.id === elementId);
  const cutNap = napById.get(elementId);

  let element: CutImpact["element"];
  let rootId: string;
  if (run !== undefined) {
    element = { kind: "run", id: run.id, from: run.from, to: run.to };
    rootId = run.to;
  } else if (cutNap !== undefined) {
    element = { kind: "nap", id: cutNap.id, name: cutNap.name };
    rootId = cutNap.id;
  } else {
    throw new Error(`Unknown element: ${elementId}`);
  }
  if (!napById.has(rootId)) {
    throw new Error(`Cut element ${elementId} ends at an unknown NAP: ${rootId}`);
  }

  const children = new Map<string, string[]>();
  for (const nap of network.splitters) {
    const siblings = children.get(nap.parent);
    if (siblings === undefined) children.set(nap.parent, [nap.id]);
    else siblings.push(nap.id);
  }

  // Breadth-first, with a visited set and a step bound: a hand-built cyclic
  // network throws instead of looping, like `walkToOlt`.
  const outIds = new Set<string>([rootId]);
  const queue: string[] = [rootId];
  let steps = 0;
  while (queue.length > 0) {
    const current = queue.shift() as string;
    steps += 1;
    if (steps > network.splitters.length) {
      throw new Error(`Cascade cycle detected while walking down from ${rootId}`);
    }
    for (const childId of children.get(current) ?? []) {
      if (outIds.has(childId)) {
        throw new Error(
          `Cascade cycle detected while walking down from ${rootId}: revisited ${childId}`,
        );
      }
      outIds.add(childId);
      queue.push(childId);
    }
  }

  const naps = [...outIds]
    .map((id) => napById.get(id))
    .filter((nap): nap is NonNullable<typeof nap> => nap !== undefined)
    .map((nap) => ({ id: nap.id, name: nap.name }))
    .sort(byId);
  const subscribers = network.subscribers
    .filter((subscriber) => outIds.has(subscriber.nap))
    .map((subscriber) => ({ id: subscriber.id, name: subscriber.name, nap_id: subscriber.nap }))
    .sort(byId);
  const runs = network.fiber_runs
    .filter((candidate) => outIds.has(candidate.from))
    .map((candidate) => candidate.id)
    .sort();

  return {
    element,
    naps_out_of_service: naps,
    subscribers_out_of_service: subscribers,
    runs_out_of_service: runs,
    counts: { naps: naps.length, subscribers: subscribers.length, runs: runs.length },
  };
}
