# Tasks — map copilot

As in Phases 1 and 2, **no task may call the Anthropic API** — not from tests, not from the browser.
Browser checks replay a recorded turn (design.md, decision 7). Group 7 is the one real-API run and
is done by hand, not by the implementation loop.

Every task ends green: `npm test`, `npm run lint` and `npx tsc --noEmit` pass before it is ticked.

## 1. Setup

- [x] 1.1 Install `maplibre-gl` as a runtime dependency (`npm install maplibre-gl`); verify it is in
      `package.json` `dependencies` and `npm test` still reports the existing 196 tests passing.
- [x] 1.2 Add `src/lib/map/config.ts` with the OpenFreeMap style URL
      (`https://tiles.openfreemap.org/styles/positron`), the fallback background style, the initial
      center (the OLT, `[-58.9866, -27.4512]`) and zoom, the fit-bounds padding, and the status
      colour table from design.md decision 2 — each constant commented; verify `tsc` passes.
- [x] 1.3 Change `metadata` in `src/app/layout.tsx` to title "FiberDesk" and a one-line description;
      verify by reading the file.

## 2. Pure helpers (unit-tested, no DOM)

- [x] 2.1 Add `src/lib/map/geojson.ts` with `networkToGeoJson(network)` returning `olt`, `naps`,
      `runs`, `subscribers` FeatureCollections (design.md decision 3); add
      `src/lib/map/geojson.test.ts` against the seed asserting 1 / 12 / 12 / 28 features, that node
      coordinates are `[lon, lat]` (OLT → `[-58.9866, -27.4512]`), that FR-12's first vertex is
      NAP-03's position, and that NAP features carry `id`, `name`, `ratio`, `parent`.
- [x] 2.2 Add `src/lib/map/highlight.ts` with `resolveHighlight(payload, network, budgets)`
      (design.md decision 3); add tests: the reference payload (NAP-12 marginal 2.77, NAP-09 fail
      -1.40, `fit_bounds: true`) gives `napStatus` with exactly those two, `runIds` equal to
      `FR-03, FR-12, FR-04, FR-09` (any order), bounds containing the OLT, both NAPs and every
      vertex of those four runs; `fit_bounds: false` gives `bounds: null` with statuses still set;
      an empty payload gives empty status, no runs, `bounds: null`; an unknown id `NAP-99` lands in
      `unknownIds` and does not affect the rest; the status in the result is the payload's even if
      a test passes a payload whose status differs from the budget's.
- [x] 2.3 Add `src/lib/map/breakdown.ts` with `formatBreakdown(result, napName)` returning display
      rows (per hop: run id, length km, fiber dB, splitter ratio + dB, connectors count + dB, splices
      count + dB; then by-source totals, total, budget, margin, status); add tests using the real
      engine on the seed: NAP-12 shows two hops (FR-03 with 1:2 at "3.50", FR-12 with 1:16 at
      "13.50"), totals "4.95", "17.00", "2.40", "0.88", total "25.23", budget "28.00", margin
      "2.77", status marginal; NAP-09 total "29.40", margin "-1.40", fail; NAP-03 total "7.98",
      margin "20.02", pass; and every numeric string equals `value.toFixed(2)` of the matching
      `BudgetResult` field (no re-computation).
- [x] 2.4 Move the SSE frame splitter out of `src/app/page.tsx` into `src/lib/assistant/stream.ts`
      as exported `createFrameSplitter()`; add tests in `stream.test.ts` for a frame split across
      two chunks, two frames in one chunk, blank frames dropped, and a trailing partial frame held
      back; verify the old copy is deleted from the page and tests pass.

## 3. Chat panel

- [x] 3.1 Create `src/components/ChatPanel.tsx` ("use client") by moving the chat state, SSE reading
      and transcript UI out of `src/app/page.tsx` with behaviour unchanged, using
      `createFrameSplitter`; add prop `onTurnDone(payload: HighlightPayload)` called in the `done`
      case in place of the `console.log`; drop the "Map highlight logged to the console" note; make
      it fill its container height with the transcript scrolling and the input pinned at the
      bottom. Verify `tsc` and lint pass.

## 4. Map

- [ ] 4.1 Create `src/components/NetworkMap.tsx` ("use client"): create the map once in an effect with
      a ref guard and `map.remove()` cleanup, via dynamic `import("maplibre-gl")`; add the four
      GeoJSON sources from `networkToGeoJson` with `promoteId: "id"` and layers — runs (line),
      subscribers (small circle), NAPs (circle + text label with the id), OLT (larger circle +
      label) — using the colours from `config.ts`; initial view fits the OLT and all NAPs. Verify in
      the browser preview (`fiberdesk-dev`) that 12 NAP labels and the OLT are visible over
      Resistencia and the console shows no errors.
- [ ] 4.2 Add the fallback: on a style load `error`, switch to the fallback background style and
      re-add the overlay. Verify in the browser by temporarily pointing the style URL at an
      unreachable host: the network still draws on a plain background; then restore the URL.
- [ ] 4.3 Apply the resolved highlight: props `highlight` (a `resolveHighlight` result) drive
      `setFeatureState` on NAPs (`status`) and runs (`onPath`, with the status colour of the NAP it
      leads to), resetting previous state first; paint expressions read feature state (neutral when
      unset, thicker line on path); call `fitBounds(bounds, { padding })` when `bounds` is non-null.
      Verify with the replay in 6.1.
- [ ] 4.4 Make NAPs clickable (pointer cursor on hover, click → `onSelectNap(id)`). Verify in the
      browser: clicking NAP-12 selects it (visible once 5.2 lands; until then, via a temporary
      `console.log` removed before commit).

## 5. Page composition

- [x] 5.1 Create `src/components/Copilot.tsx` ("use client") taking `network` and `budgets`; hold the
      latest non-empty `HighlightPayload` (design.md decision 6) and `selectedNapId`; compute
      `resolveHighlight` with `useMemo`; import `maplibre-gl/dist/maplibre-gl.css`; layout per
      design.md decision 5 (map full height, chat right column ~400px on `md`+, stacked under `md`);
      a "Clear highlight" button visible only when a highlight is active.
- [ ] 5.2 Add the breakdown card (inside `Copilot` or `src/components/BudgetBreakdown.tsx`) rendered
      from `formatBreakdown` for the selected NAP, with a status badge in the status colour and a
      close button. Verify in the browser: clicking NAP-12 shows 25.23 / 28.00 / 2.77 marginal and
      both hops; NAP-03 shows 7.98 / 20.02 pass — before any question is asked.
- [x] 5.3 Turn `src/app/page.tsx` into a server component: `loadNetwork()` +
      `calculateAllBudgets(network)` → `<Copilot network budgets />`. Verify `npm run build`
      succeeds and the page loads in the preview with map and chat side by side.

## 6. Browser verification (replayed, no API)

- [ ] 6.1 Replay the reference turn: in the preview, override `window.fetch` for `/api/chat` with a
      recorded SSE body (a few `text` events + `done` with NAP-12 marginal 2.77, NAP-09 fail -1.40,
      `fit_bounds: true`, and `messages` echoing the question), submit "which NAPs fail the optical
      budget?", and verify: text streams into the panel, NAP-12 is amber, NAP-09 red, the other ten
      neutral, paths FR-03→FR-12 and FR-04→FR-09 marked, view reframed to them. Screenshot.
- [ ] 6.2 Replay a second turn whose `done` payload is empty: verify the highlight and view are
      unchanged. Then "Clear highlight": verify all NAPs neutral, no path marked.
- [ ] 6.3 Replay a payload containing `NAP-99` plus NAP-01 pass: verify NAP-01 is highlighted,
      nothing appears for NAP-99, no console error.
- [ ] 6.4 Resize to mobile (375×812): map and chat stack, no horizontal scroll; then reset the
      viewport to desktop. Screenshot.
- [ ] 6.5 Full check: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` all pass; the
      test count is 196 plus the new ones.

## 7. Real-API verification (by hand, not the loop)

- [ ] 7.1 With `ANTHROPIC_API_KEY` set, ask "¿qué cajas no cierran el presupuesto óptico?" and
      confirm the map highlights NAP-09 (fail) and NAP-12 (marginal) and reframes; ask a question
      the data cannot answer (ONT receiver sensitivity) and confirm the assistant declines and the
      map does not change. Record both in `verification.md` in this change folder.

## 8. Docs

- [ ] 8.1 Update `README.md` for the map (what you see, how to run, OpenFreeMap as the tile source)
      and the "Estado actual" section of `CLAUDE.md` to mark Phase 3 complete; verify both read
      correctly.
