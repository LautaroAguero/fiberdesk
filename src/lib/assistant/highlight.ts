/**
 * Projects the map payload from the tool results a turn already collected.
 * The assistant's prose contributes nothing to it — see design.md
 * (add-subscriber-trace), decision 7, and specs/network-assistant/spec.md,
 * "The map payload is produced by the server".
 *
 * Only `detail_optical_budget` calls become entries here (and, from task 3.2,
 * `trace_subscriber_link`). `summarize_optical_budgets` returns all twelve
 * NAPs for the model's own reasoning; highlighting all twelve — ten of them
 * passing — would defeat the point of pointing at a problem. The NAPs the
 * model chose to zoom into are the ones worth drawing attention to, which is
 * exactly the reference use case in CLAUDE.md.
 *
 * A detail call contributes its NAP plus one run entry per hop of its path,
 * taking the NAP's status. Entries merge by `(kind, id)`: a run named by two
 * entities keeps the worse status (`fail` over `marginal` over `pass`).
 */

import type { ToolCallRecord } from "@/lib/assistant/loop";
import { DETAIL_TOOL_NAME } from "@/lib/assistant/tool-definitions";
import type { HighlightEntry, HighlightPayload } from "@/lib/assistant/events";
import type { BudgetResult, BudgetStatus } from "@/lib/optical/budget";

const SEVERITY: Record<BudgetStatus, number> = { pass: 0, marginal: 1, fail: 2 };

/** The worse of two classifications: `fail` over `marginal` over `pass`. */
export function worseStatus(a: BudgetStatus, b: BudgetStatus): BudgetStatus {
  return SEVERITY[b] > SEVERITY[a] ? b : a;
}

/** Adds the runs of `hops` to `entries`, each with `status`, merging a repeated run to the worse one. */
function addRuns(
  entries: Map<string, HighlightEntry>,
  hops: BudgetResult["hops"],
  status: BudgetStatus,
): void {
  for (const hop of hops) {
    const key = `run:${hop.run_id}`;
    const existing = entries.get(key);
    entries.set(key, {
      kind: "run",
      id: hop.run_id,
      status: existing === undefined ? status : worseStatus(existing.status, status),
    });
  }
}

export function projectHighlight(toolCalls: ToolCallRecord[]): HighlightPayload {
  const entries = new Map<string, HighlightEntry>();

  for (const call of toolCalls) {
    if (call.isError) continue;

    if (call.name === DETAIL_TOOL_NAME) {
      const result = call.result as BudgetResult;
      entries.set(`nap:${result.nap_id}`, {
        kind: "nap",
        id: result.nap_id,
        status: result.status,
        margin_db: result.margin_db,
      });
      addRuns(entries, result.hops, result.status);
    }
  }

  const highlight = [...entries.values()];
  return {
    highlight,
    fit_bounds: highlight.some((entry) => entry.kind === "nap" || entry.kind === "subscriber"),
  };
}
