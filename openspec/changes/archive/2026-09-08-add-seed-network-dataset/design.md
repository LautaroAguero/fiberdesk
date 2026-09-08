# Design — seed network dataset

## Context

The repository is an unmodified Next.js 16 scaffold: no data, no test runner, no `src/lib`.
Node 24, TypeScript 5, path alias `@/*` already configured in `tsconfig.json`.

See `proposal.md` — *Why* for motivation and `specs/network-dataset/spec.md` for the contract.

Two future consumers shape the shape of this data: the Phase 1 budget tool, which walks from an
arbitrary NAP up to the OLT summing losses, and the Phase 3 map, which draws the same entities as
points and lines. Both bind to whatever is decided here.

## Goals / Non-Goals

**Goals:**

- One entity contract, defined once, that both future consumers read without transformation.
- A shape that makes upward traversal from any NAP a simple parent walk — no graph library, no
  index building.
- Validation that runs at the boundary, so no downstream code has to defend against a malformed
  network.
- Fixture numbers committed to the repository, so the Phase 1 calculator has an oracle written
  before it exists.

**Non-Goals (design level):**

- Designing the traversal or summation algorithm itself. This change proves the data supports it;
  Phase 1 writes it.
- Choosing a map projection, tile source or rendering strategy.
- Any schema-versioning or migration story. The seed is checked in and changes with the code.

## Decisions

### 1. Loss contributors live on the fiber run, never cumulatively on the NAP

A NAP stores only its parent and its splitter ratio. Length, splices and connectors belong to the
run that reaches it.

*Alternative considered:* store the cumulative distance-from-OLT on each NAP. Rejected — cumulative
values are derived data that duplicates the runs and goes stale the moment a run changes. Keeping
per-run values means the cascade needs no special handling at all: NAP-12's 19.8 km is simply
FR-03 (11.2) plus FR-12 (8.6), summed by the same walk that sums everything else.

### 2. The fiber run is its own entity, not fields folded into the NAP

*Alternative considered:* put `from`, `length_km`, `splices` and `connectors` directly on the NAP,
since in this dataset each NAP has exactly one upstream run. Rejected — Phase 3 needs the run as a
drawable object with its own identity and geometry, and collapsing it would force Phase 3 to
reconstruct what Phase 0 threw away.

### 3. Splitter ratio is a string literal union, not a number

`"1:2" | "1:4" | "1:8" | "1:16" | "1:32"`. It reads the way a technician says it, the loss table is
keyed by it directly, and TypeScript rejects an unsupported ratio at compile time.

*Alternative considered:* store the split factor as a number (`8`). Rejected — it needs a mapping
back to the loss table anyway, and buys nothing.

### 4. Coordinate order differs between nodes and geometry, deliberately

Nodes carry named fields `lat` / `lon`. Fiber-run `geometry` is an array of `[lon, lat]` pairs, in
GeoJSON order, because that is what MapLibre will consume unmodified in Phase 3.

This mismatch is a genuine footgun. It is accepted rather than smoothed over because the
alternative — storing geometry as `[lat, lon]` — moves the conversion into Phase 3's render path,
where getting it wrong puts the network in the wrong hemisphere silently. Named fields on nodes
make their order unambiguous; the geometry array is documented in the type.

### 5. Validation is hand-written, with no schema library

The checks that matter here — single root, no cycles, every reference resolves — are graph
properties that no schema library performs. Adding Zod would still leave those hand-written and
would buy only field-shape checks that a small type guard already covers.

*Deferred, not rejected:* Phase 1 validates model-supplied tool inputs, which is the case Zod is
actually good at. Reconsider then, as a dependency added for that reason.

### 6. Test runner: Vitest

*Alternative considered:* Node 24's built-in `node --test`, which now strips TypeScript types
natively and would add zero dependencies. Rejected because it does not resolve the `@/*` path alias
without a custom loader, and every later phase will want a watch mode and a mocking story anyway.
The cost is one dev dependency, paid once for the whole project.

### 7. The seed lives at `seed/network.json`, read from disk on the server

Not `public/` — it is not a static asset to be served. Not imported as a module — a JSON import
that ever reaches a client component pulls the whole network into the browser bundle. It is read
with `fs` from server-side code, which also gives the validator a natural place to run.

### 8. The expected outcomes are committed as a fixture, derived by hand

The table below was derived arithmetically from the constants in the project brief and
cross-checked against the worked NAP-12 breakdown in `CLAUDE.md`. It is the acceptance test that
Phase 1's calculator must reproduce. Deriving it now, before the calculator exists, is the point:
an oracle written after the implementation only proves the implementation agrees with itself.

## Topology

One OLT, `OLT-RES-01`, at −27.4512 / −58.9866, tx 3.0 dBm, GPON class B+ (28.00 dB budget,
3.00 dB minimum recommended margin). Cumulative columns are sums along the path to the OLT.

| NAP | Name | Parent | Ratio | Run km | Conn | Splices | Cum. km | Cum. conn | Cum. splices | Total dB | Margin dB | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| NAP-01 | Centro | OLT-RES-01 | `1:8` | 3.2 | 2 | 3 | 3.2 | 2 | 3 | 12.34 | 15.66 | pass |
| NAP-02 | Barrio España | OLT-RES-01 | `1:16` | 5.6 | 3 | 4 | 5.6 | 3 | 4 | 16.42 | 11.58 | pass |
| NAP-03 | Villa Don Andrés | OLT-RES-01 | `1:2` | 11.2 | 3 | 6 | 11.2 | 3 | 6 | 7.98 | 20.02 | pass |
| NAP-04 | Barrio Provincias Unidas | OLT-RES-01 | `1:8` | 12.0 | 3 | 6 | 12.0 | 3 | 6 | 15.18 | 12.82 | pass |
| NAP-05 | Barrio Sarmiento | OLT-RES-01 | `1:8` | 6.4 | 2 | 4 | 6.4 | 2 | 4 | 13.22 | 14.78 | pass |
| NAP-06 | Villa Prosperidad | OLT-RES-01 | `1:32` | 20.0 | 5 | 7 | 20.0 | 5 | 7 | 24.56 | 3.44 | pass |
| NAP-07 | Barrio Mujeres Argentinas | OLT-RES-01 | `1:8` | 12.4 | 4 | 6 | 12.4 | 4 | 6 | 15.68 | 12.32 | pass |
| NAP-08 | Barrio Italia | OLT-RES-01 | `1:16` | 7.8 | 3 | 5 | 7.8 | 3 | 5 | 17.05 | 10.95 | pass |
| NAP-09 | Barrio Los Silos | NAP-04 | `1:8` | 8.8 | 3 | 4 | 20.8 | 6 | 10 | 29.40 | −1.40 | **fail** |
| NAP-10 | Villa Río Negro | OLT-RES-01 | `1:4` | 9.1 | 3 | 5 | 9.1 | 3 | 5 | 11.08 | 16.92 | pass |
| NAP-11 | Barrio San Cayetano | OLT-RES-01 | `1:16` | 4.5 | 2 | 3 | 4.5 | 2 | 3 | 15.67 | 12.33 | pass |
| NAP-12 | Barrio Güiraldes | NAP-03 | `1:16` | 8.6 | 3 | 5 | 19.8 | 6 | 11 | 25.23 | 2.77 | **marginal** |

Two cascades, chosen to fail for different reasons:

- **NAP-04 → NAP-09**, two 1:8 splitters in series. 21.00 dB of the 29.40 dB total is splitter loss.
  This one fails outright.
- **NAP-03 → NAP-12**, a 1:2 feeding a 1:16. Only 17.00 dB of splitter loss, but 19.8 km of fiber
  and 11 splices push it to 25.23 dB — passing, with 2.77 dB of margin, under the 3.00 dB minimum.

NAP-06 is a third deliberate case: no cascade at all, but a single 1:32 splitter at the end of a
20 km run lands it at 3.44 dB — passing, just above the threshold. It exists so that the
classification boundary is exercised from both sides.

Subscriber counts respect the splitter ratio: a NAP serves no more subscribers than its ratio has
ports. NAP-09 and NAP-12 both serve subscribers, so "who is affected" has an answer.

## Risks / Trade-offs

- **The loss constants are industry-typical and pending validation** → if one changes, the fixture
  table and the spec scenarios change with it. Mitigation: treat a constant change as a change to
  this spec, not as a silent data edit. Phase 1 centralises the constants so there is one place to
  change.
- **The fixture numbers are hand-derived and could be wrong** → mitigated by cross-checking against
  the independent breakdown in `CLAUDE.md`, which they reproduce exactly. The real check is Phase 1
  arriving at them independently; if the two disagree, the disagreement is the signal.
- **Route lengths up to 20.8 km are long for a city of Resistencia's size** → deliberate. Producing
  a failing link without them would need an implausible splitter chain. The dataset is synthetic
  and says so; the spec records that route length is not straight-line distance.
- **The entity contract becomes load-bearing for two later phases** → changing it after Phase 3 is
  a breaking change for the map and the tool at once. Mitigation: the contract is deliberately
  minimal, and every field on it is one the budget calculation or the map actually needs.
- **Hand-written validation will not catch everything** → it covers the structural properties the
  spec names. Geometry that disagrees with `length_km`, or coordinates that are plausible but
  wrong, are not detected. Accepted: the data is synthetic and reviewed, not ingested.

## Migration Plan

Not applicable. The change is purely additive with no existing consumers; rollback is deleting the
added files and the `test` script.

## Open Questions

- Should a NAP carry a free-text `notes` field for Phase 2 to cite? Deferred safely — it is
  additive, affects no scenario in this spec, and the Phase 2 documentation work is what will say
  whether inline notes or external documents are the right home for that text.
