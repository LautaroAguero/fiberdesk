# Tasks — add subscriber trace

Groups 1–4 never call the Anthropic API: every check is a unit test against the seed, the oracle,
fixtures and `createFakeModelClient`. Group 5 is live, by hand, each run under its own `--max-usd`
cap. Every code task ends green: `npm test`, `npm run lint` (no warnings) and `npx tsc --noEmit`
pass before it is ticked.

## 1. The subscriber link budget (`optical-budget`)

- [x] 1.1 Add `src/lib/geo/distance.ts` with `haversineKm(a: Position, b: Position)`, using the
      IUGG mean Earth radius of 6,371.0088 km, with a unit-and-source comment (design.md,
      decision 3). Tests:
      (a) one degree of longitude on the equator is 111.195 km, to three decimals;
      (b) the distance is symmetric;
      (c) a point to itself is 0;
      (d) NAP-12 to SUB-025 is 0.38291 km, to five decimals.
- [x] 1.2 Add `DROP_SLACK_FACTOR = 1.3` and `DROP_CONNECTORS = 2` to
      `src/lib/optical/constants.ts`, each with unit, source (owner decision 2 of the 2026-10-07
      handoff, no published source) and the pending-validation mark (design.md, decision 4). Verify
      with a test that both are exported with those values.
- [x] 1.3 Write `seed/derive-expected-traces.py`, standard library only. It must not import the
      TypeScript engine, and must implement the spec's drop requirement and design.md decision 2's
      rounding table from scratch. It reads `seed/network.json` and the NAP totals from
      `seed/expected-budgets.json`. Run it to produce `seed/expected-traces.json`, which holds:
      - a `_note` like `expected-budgets.json`'s;
      - a frozen copy of the four values it used (slack, connectors per drop, fiber dB/km,
        connector dB);
      - per subscriber: `nap_id`, `straight_line_km`, `length_km`, `drop_fiber_db`,
        `drop_connectors_db`, `drop_loss_db`, `total_loss_db`, `margin_db`, `status`,
        `rx_power_dbm`, `nap_status`.

      Verify by reading the output that it contains the spec's figures:
      - SUB-025: 0.383 / 0.498 / 0.92 / 26.15 / 1.85 / marginal / −23.15;
      - SUB-014: 16.60 / 11.40 / pass;
      - SUB-018: 30.32 / −2.32 / fail;
      - SUB-011: 25.48 / 2.52 / marginal, with `nap_status` pass;
      - SUB-026: 0.458 / 0.91 / 26.14 / 1.86.

      Also verify that exactly SUB-011, SUB-012 and SUB-013 have a status different from their
      `nap_status`.
- [x] 1.4 Extend `src/lib/optical/constants.test.ts` to compare the frozen copy in
      `seed/expected-traces.json` with `DROP_SLACK_FACTOR`, `DROP_CONNECTORS`, `FIBER_DB_PER_KM` and
      `CONNECTOR_DB`, as it does for `expected-budgets.json`. Verify that the test fails when one
      value in the fixture is edited, then restore it.
- [x] 1.5 Add `src/lib/optical/trace.ts` with `traceSubscriber(network, subscriberId)` and its
      result type, as described in design.md, decisions 1, 2 and 6. It uses `calculateBudget` for
      the NAP part and never walks the tree itself, and it contains no literal loss figure. Tests in
      `trace.test.ts`, one per spec scenario:
      (a) SUB-025 cascade: the NAP part equals `calculateBudget(network, "NAP-12")`; by-source
      5.07 / 17.00 / 3.20 / 0.88; total 26.15, margin 1.85, `marginal`;
      (b) SUB-014 direct: one hop, FR-07; 16.60 / 11.40 / `pass`;
      (c) SUB-018: 30.32 / −2.32 / `fail`;
      (d) SUB-025's drop: 0.383 km, slack 1.3, 0.498 km, 0.12 + 0.80 = 0.92 dB;
      (e) SUB-026: 0.458 km, 0.91 dB, 26.14, 1.86;
      (f) SUB-011: NAP status `pass` at 3.44 and subscriber `marginal` at 2.52;
      (g) SUB-025's received power is −23.15 dBm, and the result has no sensitivity or verdict
      field;
      (h) SUB-099 throws, naming SUB-099;
      (i) all 28 subscribers equal `seed/expected-traces.json` field by field;
      (j) two calls give deep-equal results.

## 2. The payload by kind, the map and the grader (`network-assistant`, `network-map`, `assistant-evals`)

- [ ] 2.1 Replace `HighlightEntry` in `src/lib/assistant/events.ts` with the union of design.md,
      decision 7, and rewrite `projectHighlight`:
      - detail → the NAP plus its runs;
      - merge by `(kind, id)`, where a run keeps the worse status;
      - `fit_bounds` is true when any NAP or subscriber entry exists.

      Update `highlight.test.ts`. The spec scenario "Payload figures match the tool results
      exactly" checks NAP-09 −1.40, NAP-12 2.77, FR-04 and FR-09 `fail`, and FR-03 and FR-12
      `marginal`. Also test:
      - the survey contributes nothing;
      - no tools gives an empty payload with `fit_bounds` false;
      - two details sharing a run keep the worse status.
- [ ] 2.2 Rewrite `resolveHighlight(payload, network)` in `src/lib/map/highlight.ts` without the
      `budgets` argument (design.md, decision 8). It returns `napStatus`, `subscriberStatus`,
      `runStatus`, `runIds`, `unknownIds` and `bounds`. Update `highlight.test.ts` in
      `src/lib/map`, one test per network-map scenario:
      - the reference question;
      - a traced subscriber;
      - a shared run takes the worse classification (SUB-006 `pass`, NAP-12 `marginal`: FR-03
        marginal);
      - an unknown NAP, and an unknown subscriber or run, are ignored;
      - reframing on the reference question, and on SUB-025 (the bounds contain SUB-025, the OLT,
        and every vertex of FR-03 and FR-12);
      - `fit_bounds` false gives `bounds` null.
- [ ] 2.3 Update `Copilot.tsx` and `NetworkMap.tsx`:
      - set feature-state `status` on the `subscribers` source;
      - colour the subscriber circle by status, with a larger radius when highlighted;
      - clear the previous subscribers and runs on replacement and on clear;
      - stop passing `budgets` to the resolver, and keep them for the click breakdown.

      Verify in the browser with the `fiberdesk-dev` preview, replaying a recorded `done` event
      without the API (the fetch override in `openspec/changes/archive/2026-09-22-add-map-copilot/
      LOOP.md`):
      (a) the reference payload paints NAP-09 and NAP-12 and their paths, as before;
      (b) a payload with SUB-025 and FR-03/FR-12 `marginal` paints the subscriber and the path, and
      reframes;
      (c) clearing returns everything to neutral;
      (d) no console errors.

      Attach a screenshot of (b).
- [ ] 2.4 In `src/lib/evals`, make `highlightIds` return only NAP and subscriber ids (design.md,
      decision 9), and let the case validator accept oracle ids that are NAPs or subscribers.
      Tests:
      - the spec scenario "A traced subscriber is compared by its identifier";
      - the reference oracle still passes with run entries present;
      - an oracle naming SUB-099 fails to load, naming the case.

      Verify that `npm run eval:regrade -- evals/runs/2026-10-12T11-08-31Z.json` reproduces B2's
      outcomes case for case: the compare output shows no flips. Do not commit that output.

## 3. The tool (`network-assistant`)

- [ ] 3.1 Add `trace_subscriber_link` to `src/lib/assistant/tool-definitions.ts` (design.md,
      decision 6): `strict: true`, with `subscriber_id` an enum of the network's subscriber ids, and
      the description as specified. Tests:
      - the enum equals the 28 seed ids;
      - the schema is strict with `additionalProperties: false`;
      - the description names the `SUB-014` ↔ "Subscriber 014" correspondence;
      - the tool count is five.
- [ ] 3.2 Dispatch it in `src/lib/assistant/dispatcher.ts`, returning `traceSubscriber`'s result as
      JSON, and an `is_error` result naming the id for an unknown one. Extend `projectHighlight` for
      trace results: the subscriber plus `nap.hops` runs with the subscriber's status, and no NAP
      entry. Tests:
      - the dispatcher returns SUB-025's figures;
      - SUB-099 gives an error result;
      - the spec scenario "A traced subscriber" for the payload;
      - a turn that traces SUB-025 and details NAP-12 gives a subscriber entry, a NAP entry, and
        FR-03/FR-12 `marginal`.
- [ ] 3.3 Add `drop_slack_factor` and `drop_connectors` to the `get_optical_constants` result in
      `src/lib/assistant/optical-constants.ts`, each with its unit and the pending-validation
      status. Verify with an extended test in `optical-constants.test.ts`.
- [ ] 3.4 Update `src/lib/assistant/system-prompt.ts` (design.md, decision 6):
      - one paragraph on when to call `trace_subscriber_link`, and that a NAP's status does not
        stand for its subscribers';
      - add to the "cannot answer" list: a subscriber id the network lacks, and whether a
        subscriber's ONT will work (receiver sensitivity is not modelled).

      Verify with a test that the prompt names the tool. Verify that `promptHash` changes from
      `fa57f136375a…`; that change is expected, and it is recorded in the commit message.

## 4. Eval cases (`assistant-evals`)

- [ ] 4.1 Add `trace` to `AREAS` and write `evals/cases/trace.json` with the seven cases of
      design.md, decision 9, by hand. Add a test that every figure in a `trace-*` case equals
      `seed/expected-traces.json` for the subscriber it names. Verify that the cases load (`npm
      test`) and that the summary has a `trace` row on a fake run.

## 5. Live verification (by hand)

- [ ] 5.1 Smoke run: `npm run eval -- --cases 'trace-*' --max-usd 0.40`. Verify that the
      `trace_subscriber_link` calls carry valid ids, that payloads hold subscriber entries, and that
      every call after the first reads from the cache. Commit the record.
- [ ] 5.2 Full run: `npm run eval -- --max-usd 2.00`. Commit the record, re-grade it, and run
      `npm run eval:compare` against B2 (`evals/runs/2026-10-12T11-08-31Z.regraded.json`). Write
      `openspec/changes/add-subscriber-trace/verification.md` with:
      - the `trace` area's pass rate and interval;
      - every existing case that flipped, each read by hand against the noise floor (B1/B2 differ
        only on `conv-and-nap12-es`);
      - a hand reading of `trace-unknown-es` and `trace-ont-verdict-es`, checking that the prose
        declines, which no grader reads.

      A stable case that regresses because of the new tool is fixed before group 6, and a fix that
      changes the prompt means a new run.
- [ ] 5.3 In the app (`fiberdesk-dev` preview), ask "¿por qué el abonado SUB-025 tiene poca
      señal?". Verify that the answer streams, that SUB-025 and FR-03 → FR-12 are painted marginal,
      that the view reframes, and that the server log shows the trace call. Record it in
      `verification.md`, with a screenshot.

## 6. Docs

- [ ] 6.1 Update the README:
      - a subscriber-trace section, with SUB-025 as the worked example, every figure copied from
        the oracle;
      - the two drop constants listed as assumptions beside the others;
      - the NAP-06 finding;
      - the enum's scale limit;
      - the eval table with the `trace` area, from the committed record.

      Verify each figure against its source by reading both.
- [ ] 6.2 Update the status section of `CLAUDE.md`:
      - five tools;
      - the payload by kind;
      - the new test count and eval result;
      - the feasibility drop finding (design.md, decision 12);
      - "Lo próximo: `add-cut-impact`".

      Verify that the README and `CLAUDE.md` state the same numbers.
