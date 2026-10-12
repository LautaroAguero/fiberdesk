/**
 * Free ports per NAP: outputs of the splitter, less what already hangs off it.
 *
 * Feeding a child NAP (a cascade) consumes one output of the parent's splitter,
 * exactly like serving a subscriber does. That is why NAP-03, a 1:2 with one
 * subscriber and NAP-12 below it, is full. This is the only place a split ratio
 * becomes a number of ports: the splitter loss table stays keyed by the ratio
 * string. It lives beside `cut.ts` because it is topology, not light. No id from
 * the seed appears in this file. See design.md (add-feasibility), decision 2.
 */

import type { Network, SplitterRatio } from "@/lib/network/types";

/** How the outputs of one NAP's splitter are used. */
export interface NapPorts {
  /** Outputs of the splitter: the right-hand side of the ratio. */
  outputs: number;
  /** Subscribers the NAP serves. */
  subscribers: number;
  /** NAPs fed from this one (cascade children). */
  child_naps: number;
  /** `outputs - subscribers - child_naps`. Never negative. */
  free: number;
}

/** The number of outputs of a splitter ratio: `"1:16"` is 16. */
function outputsOf(ratio: SplitterRatio): number {
  return Number(ratio.split(":")[1]);
}

/**
 * Computes the ports of every NAP in the network.
 *
 * Throws, naming the NAP, if its subscribers and child NAPs outnumber its
 * outputs: never a negative count.
 */
export function freePorts(network: Network): Map<string, NapPorts> {
  const result = new Map<string, NapPorts>();

  for (const nap of network.splitters) {
    const outputs = outputsOf(nap.ratio);
    const subscribers = network.subscribers.filter((s) => s.nap === nap.id).length;
    const childNaps = network.splitters.filter((child) => child.parent === nap.id).length;
    const free = outputs - subscribers - childNaps;

    if (free < 0) {
      throw new Error(
        `${nap.id} is oversubscribed: a ${nap.ratio} splitter has ${outputs} outputs, ` +
          `but serves ${subscribers} subscribers and feeds ${childNaps} NAPs`,
      );
    }
    result.set(nap.id, { outputs, subscribers, child_naps: childNaps, free });
  }

  return result;
}
