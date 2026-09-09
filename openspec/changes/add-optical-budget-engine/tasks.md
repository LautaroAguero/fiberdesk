# Tasks — optical budget engine

The design's single Open Question (a lighter result shape for the Phase 3 map) is a narrowing of an
existing shape and gates no task below.

## 1. Optical constants

- [ ] 1.1 Create `src/lib/optical/constants.ts` holding `FIBER_DB_PER_KM` (1490 nm, downstream),
      `CONNECTOR_DB`, `SPLICE_DB`, `SPLITTER_DB` per ratio, and `GPON_CLASS` as an object per class
      carrying `budget_db`; comment each with its unit and its standing as industry-typical and
      pending validation; verify `npx tsc --noEmit` passes.
- [ ] 1.2 Add `MIN_MARGIN_DB` to the same module, visibly separated and documented as an
      operational recommendation rather than a physical constant; verify the comment says so.
- [ ] 1.3 Add the tripwire test: assert the constants module and the frozen `loss_model` in
      `seed/expected-budgets.json` agree value for value, so editing a constant fails loudly.

## 2. Path traversal

- [ ] 2.1 Implement the walk from a NAP up to the OLT, returning ordered hops (fiber run, both
      endpoints, and the splitter terminating each hop) with the OLT-side hop first; include unit
      tests that NAP-01 yields one hop over FR-01 and NAP-12 yields two, FR-03 then FR-12.
- [ ] 2.2 Add the visited-set guard and its unit test: a hand-built network whose two NAPs are each
      other's parent raises an error naming both, rather than looping.
- [ ] 2.3 Add the unit test that a request for `NAP-99` raises an error naming it and returns no
      result.

## 3. Core calculation

- [ ] 3.1 Compute each hop's four loss contributions from the constants module, with no literal
      loss values in the calculation; include unit tests asserting NAP-12's hops exactly — FR-03 at
      fiber 2.80, splitter 1:2 at NAP-03 3.50, connectors 1.20, splices 0.48; FR-12 at fiber 2.15,
      splitter 1:16 at NAP-12 13.50, connectors 1.20, splices 0.40.
- [ ] 3.2 Aggregate the hops into per-source totals and a total attenuation, applying the single
      rounding helper at the boundary; include unit tests for NAP-01 at 12.34 dB, NAP-12 at
      25.23 dB and NAP-09 at 29.40 dB, and that the four sources sum to the reported total.

## 4. Margin and classification

- [ ] 4.1 Take the link budget from the GPON class the OLT declares and compute the margin;
      include unit tests that NAP-12 under B+ gives 2.77 dB and under C+ gives 6.77 dB, with the
      total attenuation unchanged at 25.23 dB in both.
- [ ] 4.2 Classify as failing below zero margin, marginal below the minimum, passing otherwise,
      reading the project default and accepting a per-call override; include unit tests for NAP-09
      failing at -1.40, NAP-12 marginal at 2.77, NAP-06 passing at 3.44 and NAP-01 passing at
      15.66.
- [ ] 4.3 Add the unit test that raising the minimum to 5.00 dB reclassifies NAP-06 as marginal
      while its 24.56 dB total and 3.44 dB margin stay unchanged.

## 5. Received power

- [ ] 5.1 Report `rx_power_dbm` as the OLT's declared transmit power less the total attenuation;
      include unit tests for NAP-12 at -22.23 dBm and NAP-09 at -26.40 dBm, the latter also
      asserting the link is still classified as failing.

## 6. The whole network in one pass

- [ ] 6.1 Implement `calculateAllBudgets(network)` as a map over the single-NAP function, returning
      an array ordered as `network.splitters`; include a unit test that 12 results come back with
      NAP-09 the only failure and NAP-12 the only marginal one.
- [ ] 6.2 Add the unit test that every batch entry is identical field for field to the same NAP
      computed individually, across all 12.

## 7. Determinism and the fixture

- [ ] 7.1 Add unit tests that two calls for the same NAP return identical results, and that
      reported values carry no floating-point residue — NAP-12's total is exactly 25.23.
- [ ] 7.2 Add the acceptance test binding the engine to `seed/expected-budgets.json`: for all 12
      NAPs, the total, the four per-source figures, the margin and the status match the committed
      fixture.

## 8. Close-out

- [ ] 8.1 Document the engine in `README.md` (in English) — what it computes, that the arithmetic
      never runs in the model, and that the fixture is bound to the tests; verify by reading it
      back against the proposal's Why.
- [ ] 8.2 Run `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build`, and verify all
      four pass clean.
