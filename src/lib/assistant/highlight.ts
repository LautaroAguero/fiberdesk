/**
 * Projects the map payload from the tool results a turn already collected.
 * The assistant's prose contributes nothing to it — see design.md,
 * decision 5, and specs/network-assistant/spec.md, "The map payload is
 * produced by the server".
 *
 * Only `detail_optical_budget` calls become entries. `summarize_optical_budgets`
 * returns all twelve NAPs for the model's own reasoning; highlighting all
 * twelve — ten of them passing — would defeat the point of pointing at a
 * problem. The NAPs the model chose to zoom into are the ones worth drawing
 * attention to, which is exactly the reference use case in CLAUDE.md: the
 * two NAPs the model detailed are the two the map highlights.
 */

import type { ToolCallRecord } from "@/lib/assistant/loop";
import { DETAIL_TOOL_NAME } from "@/lib/assistant/tool-definitions";
import type { HighlightPayload } from "@/lib/assistant/events";
import type { BudgetResult } from "@/lib/optical/budget";

export function projectHighlight(toolCalls: ToolCallRecord[]): HighlightPayload {
  const byNapId = new Map<string, HighlightPayload["highlight"][number]>();

  for (const call of toolCalls) {
    if (call.name !== DETAIL_TOOL_NAME || call.isError) continue;

    const result = call.result as BudgetResult;
    byNapId.set(result.nap_id, {
      nap_id: result.nap_id,
      status: result.status,
      margin_db: result.margin_db,
    });
  }

  return {
    highlight: [...byNapId.values()],
    fit_bounds: byNapId.size > 0,
  };
}
