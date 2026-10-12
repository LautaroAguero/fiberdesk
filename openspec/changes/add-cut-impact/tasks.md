# Tasks — add cut impact

Groups 1–4 never call the Anthropic API: every check is a unit test against the seed, the oracle,
fixtures and `createFakeModelClient`. Group 5 is live, by hand, each run under its own `--max-usd`
cap. Every code task ends green: `npm test`, `npm run lint` (no warnings) and `npx tsc --noEmit`
pass before it is ticked.

## 1. The cut traversal (`cut-impact`)

- [x] 1.1 Write `seed/expected-cut-impacts.json` by hand from the tree (design.md, decision 8):
      - a `_note` like the other fixtures;
      - one entry per fiber run and per NAP (24), each with `kind`, `naps_out_of_service`,
        `subscribers_out_of_service`, `runs_out_of_service` (sorted ids) and `counts`.

      Verify by reading it against design.md's Context table. FR-03 and NAP-03 must give 2 NAPs and
      5 subscribers with FR-12 dark; FR-04 and NAP-04 must give 2 and 5 with FR-09 dark; FR-12 and
      NAP-12 must give 1 and 4.
- [x] 1.2 Add `src/lib/topology/cut.ts` with `cutImpact(network, elementId)` and the `CutImpact`
      type (design.md, decisions 1–3). It is pure, with no literals from the seed and a step bound
      on the walk. Tests in `cut.test.ts`, one per spec scenario:
      (a) FR-03: NAP-03 and NAP-12; SUB-006 and SUB-025–028; count 5; FR-12 dark;
      (b) FR-12: NAP-12; four subscribers; no dark run; NAP-03 and SUB-006 absent;
      (c) FR-04: NAP-04 and NAP-09; count 5; FR-09 dark;
      (d) FR-01: NAP-01, three subscribers;
      (e) NAP-04: element is a NAP; NAP-04 and NAP-09 out; FR-04 not dark; FR-09 dark;
      (f) FR-04 and NAP-04 list the same NAPs and subscribers;
      (g) OLT-RES-01 throws "A cut at the OLT is not supported";
      (h) FR-99 throws, naming FR-99;
      (i) all 24 elements equal `seed/expected-cut-impacts.json`;
      (j) the handoff's values, asserted directly: FR-03 → 5, FR-12 → 4, FR-04 → 5;
      (k) a hand-built network with a cascade cycle throws rather than looping;
      (l) two calls give deep-equal results.

## 2. Impact statuses, projection, map and grader (`network-assistant`, `network-map`, `assistant-evals`)

- [x] 2.1 Widen `src/lib/optical/status.ts` to `HighlightStatus`, ordered pass < marginal < fail <
      out_of_service < cut, and extend `HighlightEntry` in `src/lib/assistant/events.ts` with the
      impact variants (design.md, decision 5). Tests: the full order, and `worseStatus` on mixed
      pairs (`marginal` vs `cut` → `cut`). Verify that every existing test still passes unchanged.
- [x] 2.2 Extend `projectHighlight` for `list_cut_impact` results:
      - the element as `cut`, and every out-of-service NAP, subscriber and run as `out_of_service`,
        with no margin;
      - a merge into an impact status replaces the entry whole;
      - `fit_bounds` is true for any NAP, subscriber or cut-run entry.

      Add the tool name constant now, even though its definition comes in 3.1. Tests:
      - the spec scenario "A cut through a cascade" (FR-03);
      - "An outage outranks a budget classification" (detail NAP-12, then cut FR-03: one NAP-12
        entry, `out_of_service`, no margin);
      - the existing detail and trace scenarios, unchanged.
- [ ] 2.3 Update `resolveHighlight` to type its maps by `HighlightStatus` and merge by the shared
      order. Add `CUT_COLOR` and `OUT_OF_SERVICE_COLOR` to `src/lib/map/config.ts`, with a comment
      on why they sit outside the budget palette. In `NetworkMap.tsx`:
      - extend the colour expressions;
      - add width and opacity expressions for cut and dark runs (design.md, decision 6).

      Resolver tests:
      - the network-map scenario "A cut through a cascade";
      - "An outage outranks a classification on the same element";
      - "Reframing on a cut" (bounds contain NAP-03, NAP-12, the five subscribers, the OLT, and
        every vertex of FR-03 and FR-12);
      - the existing scenarios, unchanged.

      Verify in the browser with the `fiberdesk-dev` preview, replaying a recorded `done` event
      without the API (fetch override, as in the add-subscriber-trace verification):
      (a) the FR-03 cut payload paints FR-03 in the cut style and the subtree in the out-of-service
      style, and reframes;
      (b) the reference payload still paints NAP-09 and NAP-12 as before;
      (c) clearing returns everything to neutral;
      (d) no console errors.

      Attach a screenshot of (a). An agent without browser tools implements and commits the code,
      and leaves this box unticked for the browser check.
- [ ] 2.4 In `src/lib/evals`, add `cut` runs to `highlightIds` and accept fiber run ids in the case
      validator (design.md, decision 7). Tests:
      - "A cut is compared by its element and what it takes out";
      - "A dark downstream run is not compared";
      - the existing grader scenarios, unchanged;
      - an oracle naming FR-99 fails to load.

      Verify that `npm run eval:regrade -- evals/runs/2026-10-12T14-05-31Z.json` reproduces that
      record's outcomes case for case. Restore the overwritten `.regraded.json` afterwards; do not
      commit it.

## 3. The tool (`network-assistant`)

- [ ] 3.1 Add `list_cut_impact` to `src/lib/assistant/tool-definitions.ts` (design.md, decision 4):
      `strict: true`, with `element_id` an enum of the 12 run ids then the 12 NAP ids, and the
      description as specified. Tests:
      - the enum is exactly those 24 and excludes OLT-RES-01;
      - the schema is strict;
      - the description says to cite the counts, that an OLT cut is not supported, and not to
        substitute an element;
      - six tools in total.
- [ ] 3.2 Dispatch it in `src/lib/assistant/dispatcher.ts`, returning `cutImpact`'s result as JSON,
      or an `is_error` result carrying the engine's message. Tests:
      - FR-03's result, with `counts.subscribers` 5;
      - OLT-RES-01 and FR-99 give error results with their messages;
      - the payload for a dispatched FR-12 cut.
- [ ] 3.3 Update `src/lib/assistant/system-prompt.ts`:
      - one paragraph on when to call `list_cut_impact`, and to cite its counts;
      - add an OLT cut and an element id the network lacks to the "cannot answer" list.

      Verify with a test that the prompt names the tool. Verify that `promptHash` changes from
      `c20ecc7407bf…`, and record the new hash in the commit message.

## 4. Eval cases (`assistant-evals`)

- [ ] 4.1 Add `cut` to `AREAS` and write `evals/cases/cut.json` with the six cases of design.md,
      decision 7, by hand. Add a test that every figure and oracle id in a `cut-*` case agrees with
      `seed/expected-cut-impacts.json`. Verify that the cases load and that a fake run's summary
      has a `cut` row.

## 5. Live verification (by hand)

- [ ] 5.1 Smoke run: `npm run eval -- --cases 'cut-*' --max-usd 0.40`. Verify that every
      `list_cut_impact` call names a valid element, that no call names the OLT or a substitute, and
      that payloads hold the cut entries. Read the declines of `cut-unknown-es` and `cut-olt-es` by
      hand. Commit the record.
- [ ] 5.2 Full run: `npm run eval -- --max-usd 2.00`. Commit the record, re-grade it, and run
      `npm run eval:compare` against `evals/runs/2026-10-12T14-05-31Z.regraded.json`. Write
      `openspec/changes/add-cut-impact/verification.md` with:
      - the `cut` area's pass rate and interval;
      - every flip, each read by hand against the known noise (the 21 older cases moved by three
        between two runs);
      - the hand readings from 5.1.

      A stable case that regresses through the cut tool or its prompt paragraph is fixed before
      group 6, and a fix that changes the prompt means a new run.
- [ ] 5.3 In the app (`fiberdesk-dev` preview), ask "¿qué pasa si se corta el tendido FR-03?".
      Verify that the answer streams and states 5 subscribers, that FR-03 is painted cut and the
      subtree out of service, that the view reframes, and that the server log shows the call.
      Record it in `verification.md`, with a screenshot.

## 6. Docs

- [ ] 6.1 Update the README:
      - a cut-impact section with FR-03 as the worked example, figures copied from the oracle;
      - six tools;
      - the payload's impact statuses;
      - the eval table with the `cut` area, from the committed record.

      Verify each figure against its source.
- [ ] 6.2 Update the status section of `CLAUDE.md`:
      - six tools;
      - the impact statuses;
      - the new test count and eval result;
      - "Lo próximo: `add-feasibility`", with the drop-distance finding from add-subscriber-trace.

      Verify that the README and `CLAUDE.md` agree.
