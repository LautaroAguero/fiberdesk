# Verification — add-feasibility

## Task 4.3 — the map, with replayed turns (no API)

These checks ran on 2026-10-12 against the `fiberdesk-dev` server already running in this checkout
on port 3000. Next.js refuses a second `next dev` in the same directory. Each turn was replayed by
overriding `fetch` for `/api/chat` with an SSE body. That body carried a `done` event whose payload
was produced by the real code: `dispatchTool` and `projectHighlight` on points A, D and E, the
reference question and the FR-03 cut. No model was called.

- **(a) Selecting a point.**
  - A click on empty map space draws a hollow blue marker and shows "Clear point".
  - The next request carried `map_context.selected_point` with the clicked coordinates.
  - Clicking NAP-12 opened its breakdown (25.23 dB, margin 2.77 dB) and the marker stayed where it
    was.
  - A request sent after a reload with no point carried `map_context: {}`.
- **(b) Point E.**
  - NAP-11 (`#1`) and NAP-05 (`#2`) are drawn with teal rings, and NAP-04 (`#3`) with the
    not-feasible ring.
  - A dashed blue drop line runs from the evaluated point to NAP-11.
  - Every other NAP, run and subscriber stays neutral.
  - Screenshot: `screenshots/4.3b-point-e-replay.jpg`.
- **(c) Point A.**
  - NAP-03 (`#1`), NAP-08 (`#2`) and NAP-12 (`#3`) are drawn with not-feasible rings, and there is
    no drop line.
  - The view reframes to the point and the three NAPs.
  - Screenshot: `screenshots/4.3c-point-a-replay.jpg`.
- **(d) Point D.** NAP-06 has a yellow ring, distinct from the teal feasible ring and from the dark
  not-feasible rings on NAP-02 and NAP-08. The 6 km spread of the candidates makes the reframe span
  most of the city, as design.md expected. NAP-06 sits near the bottom-left edge of the view.
- **(e) A new point.**
  - Selecting a new point while point A's candidates were shown cleared the rings, the labels and
    "Clear highlight".
  - Selecting a new point while the FR-03 cut was shown left the cut in place.
- **(f) The two buttons.**
  - "Clear point" removed only the marker, and the cut stayed.
  - "Clear highlight" then removed only the cut.
- **(g) The older payloads.** The reference payload still paints NAP-12 and FR-03 → FR-12 in the
  marginal colour, and NAP-09 and FR-04 → FR-09 in the fail colour. The FR-03 cut still paints FR-03
  in magenta and the subtree dark.
- **(h) Dark mode.** With `prefers-color-scheme: dark` the base map is the same light style, so the
  rings and the line read the same. The chat panel is dark in both themes.
- **(i) Console:** no errors.

**A style fix found here.**
- The first not-feasible ring was gray-500 at 2 px and 0.6 opacity. On screen it disappeared
  against the neutral NAP fill: NAP-04 in (b) looked like a NAP that was not a candidate.
- It is now zinc-700 at 3 px and 0.9 opacity, in `src/lib/map/config.ts`. design.md, decision 8,
  records the change, together with the rank labels. Those moved to the `feasibility` source
  during implementation, because MapLibre cannot drive `text-field` from feature-state.

**An observation, not a defect.**
- Twice, a screenshot taken one second after a click still showed the previous marker and the old
  candidates.
- With a temporary log in the click handler (removed afterwards), every click produced the right
  point: `hitNap` was false and the coordinates were inside the city. The marker and the state
  caught up in a later screenshot.
- With DOM event logging on, five further attempts behaved correctly at the first screenshot.
- This reads as paint timing in the browser pane's captures. The selection logic is not
  implicated.

## Task 6.1 — smoke run of the feasibility cases

`evals/runs/2026-10-12T18-55-40Z.json`, prompt `5bb26aa37361`, `claude-opus-5`, effort `low`,
caching on. It passed 8/8 (Wilson 67.6–100.0%) and spent $0.2249 of a $0.50 cap. Median measured
cost per question was $0.0233, and p95 latency 12.5 s.

Read by hand:

- **The tool calls.** Every `list_connection_candidates` call had empty input `{}`. No call named
  a coordinate, and no other tool was called in place of it.
- **`feas-no-point-es`.** The tool returned the "No point is selected" error. The answer asks the
  user to click the map, and names no NAP and no figure.
- **The answers to points A, B, C, D, E and F.** Each states the verdict, every reason, the
  distances in metres, the free ports and the projected margin exactly as the tool returned them.
  - D's NAP-06 is reported as feasible but marginal (2.51 dB, under 3.00 dB), and the answer notes
    that the NAP itself passes with 3.44 dB.
  - B explains that NAP-09 has 5 free ports but projects −2.25 dB.
  - Every answer calls the drop a modelled estimate and declines to say whether the ONT will work.
- **`feas-second-option-es`.** The follow-up made no tool call. It answers about NAP-05 from the
  first turn's result: 593 m of route, 6 free ports, a 0.95 dB drop, 14.17 dB and 13.83 dB. It notes
  that 593 m is close to the 600 m maximum. Every figure, including the by-source split, is in the
  tool result.
- **A known weakness, seen again.** Several answers open with an English sentence before
  answering in Spanish ("I'll check the point you selected on the map."). In `feas-full-es`, the
  answer also opens with "I need the map point" before calling the tool, although a point was
  selected. `evals/decision-log.md` already records that no grader checks the language of an
  answer. This change adds no grader for it.
