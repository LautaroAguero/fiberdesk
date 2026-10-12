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

## Task 6.2 — full runs, read against the run of record

The comparison base is add-cut-impact's run of record,
`evals/runs/2026-10-12T17-12-15Z.regraded.json` (prompt `30844d48a2b6`, 30/34). Every flip below
was read by hand. Two nearly identical runs move the older cases by about three, so a single flip
is weak evidence on its own.

### First full run: `evals/runs/2026-10-12T18-57-01Z.json`

Prompt `5bb26aa37361`, $0.8940. It passed 37/42 (88.1%, Wilson 75.0–94.8%), and `feasibility` 8/8.

Against the run of record, there were two pass → fail flips and one fail → pass flip:

- **`trace-by-name-es`, pass → fail. This was a regression, and it was fixed.** The case had
  passed in all three runs since `add-subscriber-trace`. The answer wrote "0.498 km (383 m en
  línea recta × factor de holgura 1.3)", converting the trace's 0.383 km into metres. No tool
  returned 383. The likely trigger is this change: the new tool states distances in metres, and
  the prompt paragraph says so.
  - The fix (commit `cc779bf`) gives the shared drop `straight_line_m` and `length_m`, the
    reported km restated. The rule of design.md, decision 3, "both units, so the model never
    converts", now covers the trace too. No figure changed. The feasibility oracle gained only the
    two fields, and the prompt is unchanged.
- **`trace-cascade-es`, pass → fail.** The answer says "casi 20 km de fibra", which sums FR-03 and
  FR-12 in prose. This is the known weakness, and the case had already failed once before, in
  `2026-10-12T13-59-34Z`.
- **`budget-failing-es`, fail → pass.** The answer called the detail tool this time. The case was
  already unstable.

### Second full run, after the fix: `evals/runs/2026-10-12T19-04-33Z.json` (run of record)

Prompt `5bb26aa37361` (tool definitions and prompt unchanged), $0.9167. Results:

| Area | Passed | Rate | 95% Wilson interval |
|---|---|---|---|
| abstention | 5/5 | 100.0% | 56.6–100.0% |
| budget | 4/8 | 50.0% | 21.5–78.5% |
| conversation | 2/3 | 66.7% | 20.8–93.9% |
| cut | 6/6 | 100.0% | 61.0–100.0% |
| docs | 5/5 | 100.0% | 56.6–100.0% |
| feasibility | 8/8 | 100.0% | 67.6–100.0% |
| trace | 7/7 | 100.0% | 64.6–100.0% |
| **overall** | 37/42 | 88.1% | 75.0–94.8% |

Cost per question, measured: median $0.0176, p95 $0.0322. Cold: median $0.0482. Latency p95 is
10.7 s.

- **Trace is back to 7/7.** `trace-by-name-es` now writes the drop as the tool states it.
- **Against the run of record** (34 shared cases), there is one pass → fail flip and McNemar
  p = 1.0:
  - **`budget-margin-4db-es`.** It had passed in the eight runs before. The answer lists NAP-09,
    NAP-12 and NAP-06 correctly, then adds "las otras nueve NAPs superan los 10 dB de margen". That
    is a threshold the model drew in prose: no tool returned 10. Only the survey was called, and the
    answer touches nothing of this change, neither the new tool nor distances nor metres. It is
    the known weakness, arithmetic in prose. It is recorded rather than fixed here, and belongs to
    the pending prompt-work change.
- **The other failures** are the same known cases as before:
  - `budget-failing-en` and `budget-failing-es` stop at the survey;
  - `budget-why-nap12-es` and `conv-second-one-en` write "20" (19.8 km rounded) in prose.
- **Between the two full runs** (42 cases), two cases flipped each way. That is inside the known
  noise.
- **Older records no longer re-grade eleven cases.** Re-grading the run of record now keeps 11
  cases as recorded and names them. Their tool results no longer hash the same:
  - the four docs cases that call `get_optical_constants`, since task 1.2 added
    `max_drop_route_m`;
  - the seven trace cases, since `cc779bf` added the metres to the drop.

  This run is the new base for both groups.

## Task 6.3 — in the app, live

This ran on 2026-10-12 against the `fiberdesk-dev` server on port 3000, with the real API
(`claude-opus-5`, effort `low`, prompt `5bb26aa37361`).

- **A point next to NAP-03.** I clicked just north-east of NAP-03 and asked "¿puedo conectar un
  cliente acá?".
  - The answer streamed. It says the point cannot be connected:
    - NAP-03 is 382 m in straight line and 497 m of route, with no free ports (2 outputs, 0
      free), although its projection would pass with 19.10 dB;
    - NAP-08 is too far, at 3477 m of route;
    - NAP-12 is too far, at 3690 m, and would also be marginal (1.05 dB).
  - It calls the drop a modelled estimate and declines the ONT question.
  - The map rings the three candidates with their ranks and reframes on them. The evaluated point
    sits inside the user's marker.
  - The server log has `assistant_turn` with trajectory `[list_connection_candidates]`, 2
    iterations, $0.0247 and 10450 cached input tokens read.
  - Screenshot: `screenshots/6.3-live-near-nap03.jpg`.
- **Coordinates typed into the chat.** I cleared the point and the highlight, then asked "¿y en
  -27.46, -58.97?".
  - The answer says it cannot work with coordinates written in the chat, because the tool reads
    the point from the map, and asks for a click.
  - It names no NAP and states no figure. The server log has an empty trajectory: no tool was
    called.
  - Screenshot: `screenshots/6.3-live-typed-coordinates.jpg`.
