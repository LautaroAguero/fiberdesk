## Why

**Phase 3 — the map copilot.** Phases 1 and 2 answer questions, but the answer to "which NAPs fail
the optical budget?" is a place, and today it arrives as prose plus a `highlight` payload that the
page only logs to the console. The server already emits exactly what a map needs — which NAPs, their
classification, their margin, and whether to reframe — so the missing piece is purely the surface
that draws it. This is the project's differentiator and the last step of the thirty-second
reference demo in `CLAUDE.md`.

## What Changes

- Replace the deliberately plain chat page with a **full-screen MapLibre GL map and a chat side
  panel**. The chat keeps its current behaviour (streaming, tool activity, errors, history).
- Draw the whole synthetic network from `seed/network.json`: the OLT, the twelve NAPs, the fiber
  runs along their `geometry`, and the subscribers.
- Base map tiles from **OpenFreeMap** — no API key, no account, no new secret.
- **Consume the existing `highlight` payload** from the `done` event: colour the listed NAPs by
  status (`pass` / `marginal` / `fail`), trace the fiber path from the OLT to each of them, and
  reframe the view when `fit_bounds` is true.
- **Click a NAP to see its optical budget breakdown** — per-hop fiber, splitter, connector and splice
  losses, total, margin and status. The figures come from the deterministic engine
  (`calculateBudget`), computed on the server; the model plays no part in them and the panel
  performs no arithmetic of its own.
- Small deterministic helpers for the map (network → GeoJSON, highlight → map state, bounds) with
  unit tests. Computing a bounding box is geometry, not optical math, but it is still done in code
  and tested.
- The page's `<title>` stops saying "Create Next App".

No change to the route handler, the tools, the loop, or the `HighlightPayload` contract.

## Capabilities

### New Capabilities
- `network-map`: the map surface — drawing the network, applying the assistant's highlight,
  reframing, the per-NAP budget breakdown on click, and the chat panel living beside the map.

### Modified Capabilities
<!-- None. The highlight contract in `network-assistant` ("The map payload is produced by the
     server") is consumed as-is; its requirements do not change. -->

## Non-goals

- **Sending map state to the route handler.** `CLAUDE.md` step 1 mentions it, but no tool reads it
  yet; adding an input nothing consumes is scope creep. Deferred until a question needs it (e.g.
  "why does *this* box fail?").
- New tools, new prompts, or any change to what the model sees.
- Editing the network from the map (dragging, adding NAPs), drawing tools, measuring tools.
- Subscriber-level budgets. Subscribers are drawn for context only; the budget is per NAP, as today.
- Dark-mode map styling, custom map styles, offline tiles, clustering.
- Mobile polish beyond "does not break": on narrow screens the map and chat stack.
- Evals and the Phase 4 deployment concerns.

## Impact

- **Code:** `src/app/page.tsx` becomes a server component that loads the network and all budgets and
  hands them to a new client component; new `src/components/` for the map and chat panel; new
  `src/lib/map/` for the tested helpers; the SSE frame splitter moves out of the page into
  `src/lib/assistant/stream.ts` so it is testable.
- **Dependencies:** adds `maplibre-gl` (runtime). No new service, key, or environment variable.
- **External:** the browser fetches tiles from `tiles.openfreemap.org`. If it is unreachable the
  network overlay still renders on an empty background.
- **Tests:** the existing 196 keep passing untouched; new unit tests for `src/lib/map/` and the frame
  splitter. The map rendering itself (WebGL) is verified in the browser, not in Vitest.
