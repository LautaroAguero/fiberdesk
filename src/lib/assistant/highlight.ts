/**
 * Projects the map payload from the tool results a turn already collected.
 * The assistant's prose contributes nothing to it — see design.md
 * (add-subscriber-trace), decision 7, and specs/network-assistant/spec.md,
 * "The map payload is produced by the server".
 *
 * Only `detail_optical_budget`, `trace_subscriber_link` and `list_cut_impact`
 * calls become entries. `summarize_optical_budgets` returns all twelve
 * NAPs for the model's own reasoning; highlighting all twelve — ten of them
 * passing — would defeat the point of pointing at a problem. The NAPs the
 * model chose to zoom into are the ones worth drawing attention to, which is
 * exactly the reference use case in CLAUDE.md.
 *
 * A detail call contributes its NAP plus one run entry per hop of its path,
 * taking the NAP's status. A trace call contributes the subscriber plus one run
 * entry per hop of its NAP's path, taking the subscriber's own status; the NAP
 * itself is not added, because its classification may differ from the
 * subscriber's (add-subscriber-trace, decision 7). A cut-impact call contributes
 * the cut element as `cut` and every NAP, subscriber and run it takes out of
 * service as `out_of_service`, with no margin (add-cut-impact, decision 5).
 *
 * Entries merge by `(kind, id)` and the more severe status wins (`cut`,
 * `out_of_service`, `fail`, `marginal`, `pass`). A more severe entry replaces
 * the other whole, so no margin survives an outage. `fit_bounds` is true when
 * any NAP, subscriber or cut-run entry exists.
 */

import type { ToolCallRecord } from "@/lib/assistant/loop";
import {
  CUT_IMPACT_TOOL_NAME,
  DETAIL_TOOL_NAME,
  TRACE_TOOL_NAME,
} from "@/lib/assistant/tool-definitions";
import type { HighlightEntry, HighlightPayload } from "@/lib/assistant/events";
import type { BudgetResult, BudgetStatus } from "@/lib/optical/budget";
import { worseStatus } from "@/lib/optical/status";
import type { SubscriberTrace } from "@/lib/optical/trace";
import type { CutImpact } from "@/lib/topology/cut";

/**
 * Adds `entry` under its `(kind, id)` key. When the key is taken by an entry of a
 * different status, the more severe one is kept whole; on a tie the newer entry
 * replaces the older (they describe the same thing).
 */
function put(entries: Map<string, HighlightEntry>, entry: HighlightEntry): void {
  const key = `${entry.kind}:${entry.id}`;
  const existing = entries.get(key);
  if (
    existing !== undefined &&
    existing.status !== entry.status &&
    worseStatus(existing.status, entry.status) === existing.status
  ) {
    return;
  }
  entries.set(key, entry);
}

/** Adds the runs of `hops` to `entries`, each with `status`, merging a repeated run to the worse one. */
function addRuns(
  entries: Map<string, HighlightEntry>,
  hops: BudgetResult["hops"],
  status: BudgetStatus,
): void {
  for (const hop of hops) {
    put(entries, { kind: "run", id: hop.run_id, status });
  }
}

export function projectHighlight(toolCalls: ToolCallRecord[]): HighlightPayload {
  const entries = new Map<string, HighlightEntry>();

  for (const call of toolCalls) {
    if (call.isError) continue;

    if (call.name === DETAIL_TOOL_NAME) {
      const result = call.result as BudgetResult;
      put(entries, {
        kind: "nap",
        id: result.nap_id,
        status: result.status,
        margin_db: result.margin_db,
      });
      addRuns(entries, result.hops, result.status);
    } else if (call.name === TRACE_TOOL_NAME) {
      const result = call.result as SubscriberTrace;
      put(entries, {
        kind: "subscriber",
        id: result.subscriber_id,
        nap_id: result.nap_id,
        status: result.status,
        margin_db: result.margin_db,
      });
      addRuns(entries, result.nap.hops, result.status);
    } else if (call.name === CUT_IMPACT_TOOL_NAME) {
      const result = call.result as CutImpact;
      put(entries, { kind: result.element.kind, id: result.element.id, status: "cut" });
      for (const nap of result.naps_out_of_service) {
        put(entries, { kind: "nap", id: nap.id, status: "out_of_service" });
      }
      for (const subscriber of result.subscribers_out_of_service) {
        put(entries, {
          kind: "subscriber",
          id: subscriber.id,
          nap_id: subscriber.nap_id,
          status: "out_of_service",
        });
      }
      for (const runId of result.runs_out_of_service) {
        put(entries, { kind: "run", id: runId, status: "out_of_service" });
      }
    }
  }

  const highlight = [...entries.values()];
  return {
    highlight,
    fit_bounds: highlight.some(
      (entry) =>
        entry.kind === "nap" ||
        entry.kind === "subscriber" ||
        (entry.kind === "run" && entry.status === "cut"),
    ),
  };
}
