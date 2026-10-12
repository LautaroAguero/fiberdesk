# Tasks — add feasibility

Groups 1–5 never call the Anthropic API: every check is a unit test against the seed, the oracles,
fixtures and `createFakeModelClient`, or a browser check replaying recorded turns. Group 6 is live,
by hand, each run under its own `--max-usd` cap. Every code task ends green: `npm test`,
`npm run lint` (no warnings) and `npx tsc --noEmit` pass before it is ticked.

## 1. Shared drop, ports and the maximum (`optical-budget`)

- [x] 1.1 Move the drop computation out of `traceSubscriber` into `src/lib/optical/drop.ts`, as
      `modelDrop(from, to)` and `projectLink(napBudget, drop)` (design.md, decision 1).
      `SubscriberDrop` moves with them and is re-exported from `trace.ts`, and `trace.ts` calls
      the two functions.

      Verify that the existing `trace.test.ts`, including the full `seed/expected-traces.json`
      comparison, passes with no edit to the test or the oracle. Add `drop.test.ts`:
      - SUB-025's drop (0.383 km, 0.498 km, 0.12 + 0.80 = 0.92 dB);
      - the drop is identical to the one in SUB-025's trace;
      - `drop.ts` contains no literal loss figure.
- [x] 1.2 Add `MAX_DROP_ROUTE_M = 600` to `src/lib/optical/constants.ts`, in the operational block
      under `MIN_MARGIN_DB` (design.md, decision 4). Its comment states the unit, route rather than
      straight line, the owner-decision source, the rejected ~300 m and why, and PENDING
      VALIDATION. Expose it in `src/lib/assistant/optical-constants.ts` as `max_drop_route_m`,
      marked operational. Tests:
      - the snapshot reports 600 m, operational and pending validation;
      - the longest seed drop in `seed/expected-traces.json` is within the maximum.
- [x] 1.3 Add `src/lib/topology/ports.ts` with `freePorts(network)` (design.md, decision 2).
      Tests in `ports.test.ts`:
      - NAP-03 has 0 free ports, NAP-10 has 2, NAP-12 has 12, NAP-06 has 29;
      - the twelve seed values match design.md's Context list;
      - a hand-built 1:2 NAP with two subscribers and a child throws, naming it.
- [x] 1.4 Move the city bounds check into an exported `isInsideCity(position)` beside
      `CITY_BOUNDS`, and make the loader use it. Verify that every existing loader and validator
      test passes unchanged. Add a test: (-27.4659, -58.9700) is inside, (-34.6037, -58.3816) is
      outside, and NaN is outside.

## 2. The feasibility engine (`connection-feasibility`)

- [x] 2.1 Write `seed/derive-expected-feasibility.py`, independent of `src/`, beside
      `derive-expected-traces.py` (design.md, decision 10). Run it to produce
      `seed/expected-feasibility.json`, with a `_note`, the constants it used, points A–F and the
      28 subscriber positions. Each entry holds the point, the ranked candidates with every field
      of the result, `best_nap_id` and `feasible_count`.

      Verify by reading it against design.md's Context table: A has no best; B's NAP-09 has margin
      −2.25 and reasons `[budget_fail]`; D's NAP-06 is feasible with margin 2.51 `marginal`; E ranks
      NAP-11 then NAP-05; F has three `too_far`. Every subscriber position's own NAP is within
      600 m.
- [x] 2.2 Add `src/lib/feasibility/feasibility.ts`, with `evaluateConnection(network, point)`, the
      result types and `CANDIDATE_COUNT = 3` (design.md, decision 3). It is pure, with no literal
      from the seed. Tests in `feasibility.test.ts`, one per spec scenario:
      (a) A: NAP-03 `[no_free_ports]`, route 217, margin 19.17; NAP-08 3252 and NAP-12 3549
      `[too_far]`; no best; count 0;
      (b) B: NAP-09 `[budget_fail]`, 5 free ports, total 30.25, margin −2.25 `fail`;
      (c) C: NAP-01 feasible, route 205, margin 14.81 `pass`, best NAP-01;
      (d) D: NAP-06 feasible with projected `marginal` 2.51, while its own status is `pass` 3.44;
      (e) E: NAP-11 rank 1, NAP-05 rank 2, NAP-04 rank 3; best NAP-11; count 2;
      (f) F: three `[too_far]`, no best;
      (g) a hand-built network where the nearest NAP is infeasible and the second feasible ranks
      the second first;
      (h) a hand-built NAP failing all three checks has reasons `[too_far, no_free_ports,
      budget_fail]`;
      (i) at SUB-025's position, NAP-12's projection equals SUB-025's trace (26.15, 1.85,
      `marginal`) and its drop is identical;
      (j) a tie in distance breaks by NAP id;
      (k) (-34.6037, -58.3816) and a NaN latitude throw, naming the problem;
      (l) the point is echoed exactly;
      (m) every point and subscriber position in `seed/expected-feasibility.json` deep-equals the
      engine's result;
      (n) two calls give deep-equal results.

## 3. Map context, tool and payload (`network-assistant`)

- [x] 3.1 Thread the map context (design.md, decision 5):
      - a `MapContext` type;
      - `dispatchTool(…, mapContext = {})` and `runToolUse` take it;
      - `RunAssistantLoopParams.mapContext` is passed to them.

      Tests: the five existing tools give byte-identical results with and without a context; the
      loop passes the context through to a dispatched call (fake client).
- [x] 3.2 Parse and validate `map_context` in `src/app/api/chat/route.ts`, and pass it to the loop.
      Move the validation into a tested pure function, `parseMapContext(body)`, in
      `src/lib/assistant/`. The route stays wiring only. Tests:
      - a valid point is accepted;
      - an absent field gives `{}`;
      - an out-of-city point, a non-number and a NaN are each rejected with a message naming the
        problem.
- [x] 3.3 Add `list_connection_candidates` to `tool-definitions.ts` and dispatch it (design.md,
      decision 6): `strict: true`, no properties, and the description as specified. Tests:
      - the schema is strict and has no properties;
      - the description says it reads the selected point, to ask for a click when there is none,
        never to guess or accept typed coordinates, that distances are in metres, and that it says
        nothing about the ONT;
      - seven tools in total;
      - with point E the dispatched result is the engine's;
      - with no point it is an `is_error` result carrying the "No point is selected" message.
- [x] 3.4 Add the `point` and `candidate` kinds to `HighlightEntry`, and extend `projectHighlight`
      (design.md, decision 7). Tests:
      - the spec scenarios "Two feasible candidates" (E), "A feasible candidate with a caveat" (D)
        and "No point, no entries";
      - candidate entries do not merge with a NAP entry for the same NAP;
      - `fit_bounds` is true with a point entry;
      - every existing projection test passes unchanged.
- [x] 3.5 Update `system-prompt.ts`:
      - one paragraph on when to call `list_connection_candidates`, and that a follow-up about
        another candidate is answered from the result already returned;
      - add to the "cannot answer" list a location typed as coordinates or an address (ask for a
        click), and whether the new customer's ONT will work.

      Verify with a test that the prompt names the tool. Verify that `promptHash` changes from
      `30844d48a2b6…`, and record the new hash in the commit message.

## 4. The map (`network-map`)

- [x] 4.1 Extend `resolveHighlight` with `candidateFeasibility`, `candidateRank`, `point`,
      `dropLine` and bounds that include the point and the candidates (design.md, decision 8).
      Unknown candidate NAPs are dropped. Tests:
      - the network-map scenarios "Connection candidates", "No feasible candidate, no drop line"
        and "A payload names a candidate the map does not know";
      - "Reframing on connection candidates" (A: bounds contain the point, NAP-03, NAP-08 and
        NAP-12);
      - a NAP with both a nap entry and a candidate entry keeps the nap entry's style;
      - every existing resolver test passes unchanged.
- [x] 4.2 Point selection:
      - a general click handler in `NetworkMap.tsx` that ignores NAP hits and clicks outside the
        city;
      - `selectedPoint` state, a "Clear point" button, and clearing a feasibility payload on a new
        point in `Copilot.tsx`;
      - `ChatPanel` sends `map_context` with every request.

      Put the pure rule, "does a new point clear this payload?", in `src/lib/map/` with tests: a
      payload with a point entry is cleared, and one without is kept.
- [x] 4.3 Drawing:
      - the `selected-point` and `feasibility` sources and layers;
      - the candidate ring styles and rank labels by feature-state;
      - the colours in `src/lib/map/config.ts`, with a comment on why they sit apart from the
        budget and cut palettes.

      Verify in the browser with the `fiberdesk-dev` preview, replaying recorded `done` events
      without the API (fetch override, as in add-cut-impact 2.3):
      (a) clicking empty space shows the marker, and clicking NAP-12 opens its breakdown without
      moving it;
      (b) E's payload rings NAP-11 and NAP-05 as feasible and NAP-04 as not feasible, with ranks, and
      a drop line to NAP-11;
      (c) A's payload has no drop line and reframes to the point plus three NAPs;
      (d) D's NAP-06 ring is told apart from the feasible ring;
      (e) a new click clears (b), but leaves a cut highlight in place;
      (f) "Clear point" and "Clear highlight" each do only their own job;
      (g) the reference payload and the FR-03 cut still paint as before;
      (h) the colours are told apart in light and dark;
      (i) no console errors.

      Attach screenshots of (b) and (c). An agent without browser tools implements and commits the
      code, and leaves this box unticked for the browser check.

## 5. Eval support and cases (`assistant-evals`)

- [x] 5.1 Add `map_context` to `EvalCase`, check it with `isInsideCity` on load, pass it on every
      turn in the runner, record it in `CaseRecord`, and pass it to `dispatchTool` in regrade,
      defaulting to `{}` (design.md, decision 9). Tests:
      - the spec scenarios "A point sent with every turn", "No point declared" and "A point outside
        the city";
      - "A feasibility result is rebuilt from the recorded point";
      - "A record from before map context".

      Verify that `npm run eval:regrade` on add-cut-impact's run of record reproduces its outcomes
      case for case. Restore the overwritten `.regraded.json` afterwards; do not commit it.
- [x] 5.2 Add candidate ids to `highlightIds`, skip the point entry, and accept candidate ids as NAP
      ids in the case validator. Tests: the scenario "Candidates are compared, the point is not",
      and the existing grader scenarios, unchanged.
- [x] 5.3 Add `feasibility` to `AREAS`, and write `evals/cases/feasibility.json` with the eight cases
      of design.md, decision 9, by hand. Add a test that every figure, oracle id and point in a
      `feas-*` case agrees with `seed/expected-feasibility.json`. Verify that the cases load and
      that a fake run's summary has a `feasibility` row.

## 6. Live verification (by hand)

- [x] 6.1 Smoke run: `npm run eval -- --cases 'feas-*' --max-usd 0.50`. Verify:
      - every `list_connection_candidates` call is made with no arguments;
      - `feas-no-point-es` gets the error and asks for a click, naming no NAP;
      - the payloads hold the point and the candidates.

      Read the follow-up `feas-second-option-es` by hand. Commit the record.
- [x] 6.2 Full run: `npm run eval -- --max-usd 2.50`. Commit the record, re-grade it, and run
      `npm run eval:compare` against add-cut-impact's run of record (prompt hash `30844d48a2b6`).
      Write `openspec/changes/add-feasibility/verification.md` with:
      - the `feasibility` area's pass rate and interval;
      - every flip, each read by hand against the known noise;
      - the hand readings from 6.1.

      A stable case that regresses through the new tool or its prompt paragraph is fixed before
      group 7, and a fix that changes the prompt means a new run.
- [x] 6.3 In the app (`fiberdesk-dev` preview), click near NAP-03 and ask "¿puedo conectar un
      cliente acá?". Verify that the answer streams, says NAP-03 is full and the rest too far, that
      the candidates are painted and the view reframes, and that the server log shows the call.
      Then type "¿y en -27.46, -58.97?" with no point selected, and verify that the assistant asks
      for a click and names no NAP. Record both in `verification.md`, with screenshots.

## 7. Docs

- [x] 7.1 Update the README:
      - a feasibility section with point E as the worked example, figures copied from the oracle;
      - the 600 m maximum named as an assumption, pending validation, with the 346–383 m finding
        that set it;
      - seven tools;
      - the map context in the request, and why the tool takes no coordinates;
      - the payload's `point` and `candidate` kinds;
      - the eval table with the `feasibility` area, from the committed record.

      Verify each figure against its source.
- [x] 7.2 Update the status section of `CLAUDE.md`:
      - seven tools;
      - the map context;
      - the new test count and eval result;
      - the three handoff capabilities done;
      - "Lo próximo": the prompt work on arithmetic in prose, and the rest of Phase 4.

      Verify that the README and `CLAUDE.md` agree.
