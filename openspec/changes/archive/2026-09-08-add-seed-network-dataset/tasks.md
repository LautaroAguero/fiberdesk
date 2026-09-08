# Tasks — seed network dataset

The design's single Open Question (a `notes` field on NAPs) is additive and affects no scenario,
so it does not gate any task below.

## 1. Test infrastructure

- [x] 1.1 Add Vitest as a dev dependency and a `test` script to `package.json`; verify `npm test`
      exits cleanly reporting no test files found.
- [x] 1.2 Add the Vitest config that resolves the `@/*` alias from `tsconfig.json`; verify by
      writing a throwaway test that imports through `@/`, watching it pass, then deleting it.

## 2. Entity contract

- [x] 2.1 Create `src/lib/network/types.ts` with `SplitterRatio`, `Olt`, `Nap`, `FiberRun`,
      `Subscriber` and `Network`, documenting that node positions are named `lat`/`lon` while
      `FiberRun.geometry` is `[lon, lat]` in GeoJSON order; verify `npx tsc --noEmit` passes.

## 3. The dataset

- [x] 3.1 Write the OLT and all 12 NAPs into `seed/network.json` — ids, names, ratios and parents
      exactly as the design's topology table, coordinates inside the city bounds; verify the file
      parses and contains 1 OLT and 12 NAPs.
- [x] 3.2 Add the 12 fiber runs with the `length_km`, `splices` and `connectors` values from the
      topology table, each with a polyline geometry whose first and last points match its two
      endpoints; verify every run's `length_km` exceeds the great-circle distance between its
      endpoints.
- [x] 3.3 Add at least 20 subscribers, none exceeding its serving NAP's port count, with at least
      one on NAP-09 and at least one on NAP-12; verify the per-NAP counts against the ratios.

## 4. Loading and validation

- [x] 4.1 Implement referential-integrity checks in `src/lib/network/validate.ts` — NAP parents,
      subscriber NAPs and fiber-run endpoints all resolve; include unit tests where each dangling
      reference fails and the error names the offending entity.
- [x] 4.2 Add single-root and cycle detection to the validator; include unit tests where a
      NAP-A ↔ NAP-B cycle fails naming both, and an orphaned NAP fails naming itself.
- [x] 4.3 Add field-level checks — splitter ratio within the supported set, non-negative
      `length_km`, `splices` and `connectors`, coordinates inside the city bounds; include unit
      tests for each rule asserting the error names the entity and the offending field.
- [x] 4.4 Implement `src/lib/network/load.ts` to read the seed from disk, run the validator and
      either return a `Network` or throw; include unit tests that the real seed loads and that an
      invalid dataset throws rather than returning a partial network.

## 5. Fixture and acceptance

- [x] 5.1 Commit the expected-outcome fixture recording, per NAP, the cumulative kilometres,
      connectors, splices and ordered splitter chain plus the expected total dB, margin and status
      from the design table; verify all 12 NAPs are present.
- [x] 5.2 Add a unit test that walks the seed from each NAP to the OLT and asserts the accumulated
      inputs match the fixture for all 12 — cumulative km, connector count, splice count and
      splitter chain. This sums dataset inputs only; the dB arithmetic belongs to Phase 1.
- [x] 5.3 Add a unit test over the fixture asserting the required edge-case coverage: NAP-09 is the
      only failing link at −1.40 dB, NAP-12 is the only marginal link at 2.77 dB, and the other ten
      NAPs each hold at least 3.00 dB of margin.

## 6. Close-out

- [x] 6.1 Document the dataset in `README.md` (in English) — what it models, that it is entirely
      synthetic, and that the edge cases are deliberate; verify by reading it back against the
      proposal's Why.
- [x] 6.2 Run `npm test`, `npx tsc --noEmit` and `npm run build` and verify all three pass clean.
