# Seed network dataset

**Phase 0** — foundations. This change is deployable on its own and gates every later phase.

## Why

Phase 1 (the optical budget tool), Phase 2 (documentation grounding) and Phase 3 (the map
copilot) all read the same network. Until that network exists there is nothing to compute
over and nothing to draw, which makes the dataset the last open item of Phase 0.

The dataset cannot be arbitrary. The reference use case is the question *"which NAPs fail the
optical power budget?"* — a network where every link passes has no answer to give and
demonstrates nothing. The failures have to be in the data by construction, not by accident.

## What Changes

- Add `seed/network.json`: one OLT, 12 NAPs, the fiber runs connecting them, and the
  subscribers hanging off them. Entirely synthetic — real coordinates in Resistencia (Chaco,
  Argentina), real physics, fictional infrastructure.
- Add TypeScript types for the four entity kinds, so every later consumer shares one contract.
- Add a deterministic loader and structural validator with unit tests: referential integrity,
  exactly one root, no cycles, splitter ratios drawn from the supported set, non-negative
  lengths and counts.
- Introduce a test runner. The repository has none, and the project's own convention requires
  unit tests for deterministic code.
- Record, per NAP, the optical outcome the dataset is built to produce, as a fixture.

**This change adds no optical calculation.** The per-NAP attenuation figures it records are
hand-derived fixtures that the Phase 1 calculator must reproduce. When that calculator arrives
it will run in deterministic TypeScript, never in the model.

## Non-goals

- **No optical budget engine.** The traversal and summation logic is Phase 1.
- **No optical constants module.** The loss values appear here only as fixture arithmetic;
  their single parameterized home is created in Phase 1.
- **No UI, no map, no rendering.** Phase 3.
- **No API route and no assistant wiring.** Phase 1.
- **No runtime mutation.** The seed is read-only input, not a database. No editing, no CRUD.
- **No real data, ever.** No ISP, customer or production system data enters this repository.
- **One OLT, one city.** No multi-OLT, multi-region or multi-tenant modelling.

## Capabilities

### New Capabilities

- `network-dataset`: the structure, integrity rules and required edge-case coverage of the
  synthetic FTTH network that every other capability reads.

### Modified Capabilities

None — this is the first capability in the project.

## Impact

- **New files**: `seed/network.json`; `src/lib/network/types.ts`, `load.ts`, `validate.ts` and
  their tests.
- **`package.json`**: adds a test runner and a `test` script.
- **Existing app code**: untouched. `src/app/*` is still the unmodified scaffold.
- **Downstream**: Phase 1's budget tool and Phase 3's map both bind to the entity contract
  defined here, so changing it later is a breaking change for both.
