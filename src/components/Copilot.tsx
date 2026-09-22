"use client";

/**
 * The map and the chat, side by side. Wires the assistant's `HighlightPayload`
 * into `resolveHighlight` for `NetworkMap`, and a clicked NAP into the budget
 * breakdown — see design.md, decision 5 (layout) and decision 6 (the
 * "latest non-empty payload" highlight rule).
 *
 * `network` and `budgets` arrive as props from the server component
 * (`src/app/page.tsx`, task 5.3): the seed and the engine output are computed
 * once, server-side, and shipped down rather than fetched or recomputed here.
 */

import "maplibre-gl/dist/maplibre-gl.css";
import { useMemo, useState } from "react";

import BudgetBreakdown from "@/components/BudgetBreakdown";
import ChatPanel from "@/components/ChatPanel";
import NetworkMap from "@/components/NetworkMap";
import type { HighlightPayload } from "@/lib/assistant/events";
import { formatBreakdown } from "@/lib/map/breakdown";
import { resolveHighlight } from "@/lib/map/highlight";
import type { BudgetResult } from "@/lib/optical/budget";
import type { Network } from "@/lib/network/types";

const EMPTY_PAYLOAD: HighlightPayload = { highlight: [], fit_bounds: false };

export interface CopilotProps {
  network: Network;
  budgets: BudgetResult[];
}

export default function Copilot({ network, budgets }: CopilotProps) {
  // The latest turn whose payload named at least one NAP — a turn with none
  // (e.g. a follow-up "why?") leaves the previous highlight in place. See
  // design.md, decision 6. `null` means no turn has highlighted anything yet.
  const [highlightPayload, setHighlightPayload] = useState<HighlightPayload | null>(null);
  const [selectedNapId, setSelectedNapId] = useState<string | null>(null);

  const highlight = useMemo(
    () => resolveHighlight(highlightPayload ?? EMPTY_PAYLOAD, network, budgets),
    [highlightPayload, network, budgets],
  );

  const selectedBreakdown = useMemo(() => {
    if (selectedNapId === null) return null;
    const result = budgets.find((budget) => budget.nap_id === selectedNapId);
    const nap = network.splitters.find((candidate) => candidate.id === selectedNapId);
    if (result === undefined || nap === undefined) return null;
    return formatBreakdown(result, nap.name);
  }, [selectedNapId, budgets, network]);

  function handleTurnDone(payload: HighlightPayload) {
    if (payload.highlight.length > 0) {
      setHighlightPayload(payload);
    }
  }

  function handleClearHighlight() {
    setHighlightPayload(null);
  }

  const hasHighlight = Object.keys(highlight.napStatus).length > 0;

  return (
    <div className="flex h-screen w-screen flex-col md:flex-row">
      <div className="relative h-[55vh] w-full md:h-full md:flex-1" data-selected-nap-id={selectedNapId ?? undefined}>
        <NetworkMap network={network} highlight={highlight} onSelectNap={setSelectedNapId} />

        {hasHighlight && (
          <button
            type="button"
            onClick={handleClearHighlight}
            className="absolute top-3 left-3 rounded bg-white px-3 py-1.5 text-sm font-medium text-black shadow dark:bg-zinc-900 dark:text-zinc-50"
          >
            Clear highlight
          </button>
        )}

        {selectedBreakdown !== null && (
          <BudgetBreakdown breakdown={selectedBreakdown} onClose={() => setSelectedNapId(null)} />
        )}
      </div>

      <div className="h-[45vh] w-full border-t border-zinc-200 md:h-full md:w-[400px] md:shrink-0 md:border-t-0 md:border-l dark:border-zinc-800">
        <ChatPanel onTurnDone={handleTurnDone} />
      </div>
    </div>
  );
}
