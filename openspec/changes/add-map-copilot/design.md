# Design — map copilot

## Context

See `proposal.md` — *Why*. The contract is `specs/network-map/spec.md`; the payload it consumes is
the one defined in `openspec/specs/network-assistant/spec.md` ("The map payload is produced by the
server") and typed as `HighlightPayload` in `src/lib/assistant/events.ts`:

```ts
{ highlight: { nap_id: string; status: "pass" | "marginal" | "fail"; margin_db: number }[];
  fit_bounds: boolean }
```

Note that `CLAUDE.md`'s illustrative example uses `id` and `"warning"`. The code and the spec use
`nap_id` and `"marginal"`; they win. Nothing in this change alters the payload.

State of the code this change builds on:

- `src/app/page.tsx` is a client component holding the whole chat (history, transcript, activity,
  SSE reading). Its `frameSplitter` is a private helper with no test.
- `src/lib/network/load.ts` is server-only (`node:fs`) and deliberately never imported by client
  code.
- `calculateBudget` / `calculateAllBudgets` in `src/lib/optical/budget.ts` return a `BudgetResult`
  with `hops[]` (each carrying `run_id`, `from`, `to`, splitter, losses) — everything the breakdown
  and the path highlight need.
- Vitest runs in the `node` environment on `src/**/*.test.ts`. There is no DOM test setup, and there
  will not be one: WebGL does not run there anyway.

## Goals / Non-Goals

**Goals:**

- Every figure on screen comes from the engine, through the server, unchanged.
- Everything the map decides — what to colour, which runs to trace, where to frame — is a pure
  function with a unit test. The component only hands those results to MapLibre.
- The reference demo works end to end in under thirty seconds.

**Non-Goals (design level):**

- A second endpoint. The network and the budgets reach the browser through the page itself.
- A state-management library. React state in one client component is enough for one page.
- Server-side rendering of the map. MapLibre is browser-only.

## Decisions

### 1. The page becomes a server component that ships network + budgets as props

`src/app/page.tsx` turns into a server component: it calls `loadNetwork()` and
`calculateAllBudgets(network)` and renders `<Copilot network={…} budgets={…} />`, a client
component. The data is serialized into the RSC payload, not bundled as a module — which respects
the rule in `load.ts` that the seed is never *imported* by client code.

**Why not `GET /api/network`?** It adds an endpoint, a loading state and a failure mode for data
that is fixed at build time and ~15 KB. **Why ship all twelve budgets instead of computing on
click?** The breakdown must work before any question is asked (spec: "A NAP that passes"), and it
must not involve the model. Precomputing twelve `BudgetResult`s on the server is the cheapest way
to satisfy both, and the browser then only displays.

The page must opt out of static caching only if the seed can change at runtime — it cannot, so the
default is fine.

### 2. Status colour comes from the payload, never from `budgets`

The client *has* every NAP's status (from decision 1) but the highlight colours only the NAPs the
payload lists, with the status the payload carries. Colouring all twelve by default would make the
highlight meaningless — the same reason `projectHighlight` ignores the survey tool. In the
breakdown panel, by contrast, the status shown is the engine's — both come from the same engine,
so they cannot disagree.

Colours (Tailwind palette, also used in the panel badges): `pass` emerald-500, `marginal`
amber-500, `fail` red-600, neutral NAP slate-400, OLT indigo-600, subscriber slate-300, fiber
slate-500, highlighted path takes its NAP's status colour and a thicker line.

### 3. Pure helpers in `src/lib/map/`, each with tests

- `geojson.ts` — `networkToGeoJson(network)` → four `FeatureCollection`s (`olt`, `naps`, `runs`,
  `subscribers`). Feature `id`/properties carry the entity id, name, and (for NAPs) ratio and
  parent. `FiberRun.geometry` is already `[lon, lat]` — used as-is; nodes are converted from
  `{lat, lon}` to `[lon, lat]`. This is the one place the coordinate order is handled.
- `highlight.ts` — `resolveHighlight(payload, network, budgets)` →
  `{ napStatus: Record<napId, status>, runIds: string[], unknownIds: string[], bounds: [[w,s],[e,n]] | null }`.
  `runIds` come from `budgets[napId].hops[].run_id`, i.e. the engine's own path walk — the map
  does not re-walk the tree. `bounds` covers the OLT, the highlighted NAPs and every vertex of
  their runs' geometry; it is `null` when `fit_bounds` is false or no entry is known. Unknown ids
  go to `unknownIds` and are otherwise ignored.
- `breakdown.ts` — `formatBreakdown(result, napName)` → display rows with strings formatted to two
  decimals (`toFixed(2)`) and units. Formatting only; the test asserts no figure differs from the
  `BudgetResult` it was given.

`ToolCallRecord`-style dependencies are avoided: these helpers take `Network`, `BudgetResult[]`
and `HighlightPayload`, nothing from the assistant loop.

### 4. The chat keeps its logic, loses its page

The chat state and SSE reading move from `page.tsx` into `src/components/ChatPanel.tsx` largely
unchanged. It gets one new prop, `onTurnDone(payload: HighlightPayload)`, called from the `done`
case where it currently `console.log`s. `frameSplitter` moves to `src/lib/assistant/stream.ts` as
an exported `createFrameSplitter()` with tests (split across chunk boundaries, blank frames,
trailing partial frame).

### 5. One client component owns MapLibre

`src/components/NetworkMap.tsx` creates the map once in a `useEffect` (dynamic
`import("maplibre-gl")` so nothing touches `window` on the server), adds four GeoJSON sources and
their layers, and on every change of the resolved highlight updates layer paint through
`setFeatureState` (`status`, `onPath`) — no layer is re-added per turn. It calls `fitBounds` with
padding when `bounds` is non-null. A click on the NAP layer calls `onSelectNap(id)`.

`src/components/Copilot.tsx` holds `highlightPayload` (latest non-empty) and `selectedNapId`, and
lays out: map filling the viewport, chat panel as a right-hand column (~400px) on `md` and up;
stacked (map 55vh, chat below) under `md`. The breakdown opens as an overlay card on the map.

Style URL: `https://tiles.openfreemap.org/styles/positron` — a light, low-contrast base that keeps
the overlay readable. Centralised as a constant in `src/lib/map/config.ts` with the initial
center/zoom fallback. If the style fails to load (`error` event), the component swaps to an empty
inline style (`{ version: 8, sources: {}, layers: [{ id: "bg", type: "background", … }] }`) and
adds the overlay to it.

### 6. "Latest non-empty payload" is the highlight rule

A payload with entries replaces the current highlight. A payload with none leaves it — a follow-up
like "why?" should not wipe the answer it follows. A "Clear highlight" button resets it. This lives
in `Copilot`, as one line, and is exercised in the browser check.

### 7. Verification without the API

Unit tests cover the helpers. For the browser, the loop replays a recorded turn instead of calling
the model: before submitting a question it overrides `window.fetch` for `/api/chat` via the preview
tool's JS console, returning an SSE body with a few `text` events and a `done` event carrying the
reference payload (`NAP-12 marginal 2.77`, `NAP-09 fail -1.40`, `fit_bounds: true`). No product code
exists for this; it is a debugging aid only. One real run against the API happens once, by hand, at
the end, and is recorded in `verification.md` like Phases 1 and 2.

### 8. Adjustments found during browser verification

Recorded here rather than silently folded into the decisions above:

- **The MapLibre worker is served from `public/maplibre/`.** MapLibre 6 resolves its worker as
  `new URL("./maplibre-gl-worker.mjs", import.meta.url)`; Turbopack does not emit that file, so the
  request got Next's HTML 404 and the map never loaded. `scripts/copy-maplibre-worker.mjs` copies
  the worker and the shared chunk it imports before `dev` and `build`; `NetworkMap` calls
  `setWorkerUrl`. The copy is git-ignored, so it always matches the installed version.
- **The initial fit is re-applied on resize until the view is moved.** A map created in a hidden
  tab starts at 0×0, and MapLibre keeps the zoom rather than the bounds when it grows.
- **The fallback triggers only if no style has loaded.** `isStyleLoaded()` is also false while
  tiles and glyphs are in flight, so keying on it replaced a good base map after one 404'd glyph.
- **Labels use `Noto Sans Regular`**, which OpenFreeMap serves; MapLibre's default font 404s there.
- **Reframing uses 72 px of padding and a max zoom of 14**, so edge labels and the "Clear
  highlight" button do not collide, and a single NAP near the OLT keeps some context.
- **`ResolvedHighlight` carries `runStatus`**, the status colour for each marked run: `runIds`
  alone cannot say which NAP's colour a run takes.

## Risks / Trade-offs

- **[OpenFreeMap down or rate-limited]** → fallback background style (decision 5); the overlay is
  the product, the tiles are decoration.
- **[MapLibre + React 19 strict mode double-mount creates two maps]** → the effect guards on a ref
  and calls `map.remove()` in cleanup.
- **[`maplibre-gl` CSS not loaded → controls and popups mis-render]** → import
  `maplibre-gl/dist/maplibre-gl.css` in `Copilot.tsx`.
- **[Network sent to the browser]** → it is synthetic and small by design; this is the intended
  consumer named in `src/lib/network/types.ts` ("the optical budget tool and the map").
- **[No automated check of the rendered map]** → accepted; same position as the six behaviours
  already verified by hand. Recorded, not forgotten.

## Migration Plan

None. Single page, no persisted state, no API change. Rollback is reverting the branch.
