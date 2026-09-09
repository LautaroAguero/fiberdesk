# Optical budget engine

**Phase 1** — the conversational core. This change delivers the deterministic half of it; the
assistant that calls it is a separate change.

## Why

The dataset already knows which NAPs exist and what attenuates every path to them, and
`seed/expected-budgets.json` already states what each link should come to. Nothing computes it.
The product's core question — *which NAPs fail their optical budget* — has a committed oracle and
no engine to satisfy it.

This is also the change where the rule the whole project rests on stops being a slogan. Until an
arithmetic tool exists, there is nothing for the model to call, and a numeric answer has nowhere
to come from except the model itself.

## What Changes

- Add a single parameterized module holding every optical constant — fiber attenuation, connector
  and splice loss, splitter insertion loss per ratio, the per-class GPON budget, and the
  recommended minimum margin — each commented with its unit and its standing as
  industry-typical and pending validation.
- Add `calculateBudget(network, napId)`: walk from a NAP up to the OLT, accumulate the loss
  contributors along the way, and return the total attenuation, the margin against the OLT's
  declared GPON class, and a pass / marginal / fail classification.
- Return the result at two levels of detail: totals per loss source, and a per-hop breakdown that
  attributes each contribution to the fiber run and splitter it came from — so an explanation can
  name *which* cascade is responsible instead of asserting it.
- Return `rx_power_dbm`, the optical power reaching the NAP, derived from the OLT's declared
  transmit power. Informational: it does not participate in the pass/fail decision.
- Add `calculateAllBudgets(network)` as a plain map over the single-NAP function, so there is
  exactly one implementation of the arithmetic and no second path that can drift from it.
- Bind the unit tests to `seed/expected-budgets.json`, making the committed fixture an executable
  check rather than a document.

**All of this arithmetic runs in deterministic TypeScript and never in the model.** The model's
role, in the next change, is to decide which NAPs to ask about and to explain what comes back.
A numeric answer produced anywhere else is a bug.

## Non-goals

- **No Anthropic SDK, no tool definitions, no route handler, no streaming.** The conversational
  layer that exposes this engine is the next change. This one is plain TypeScript with tests.
- **No upstream direction.** The fiber constant is the 1490 nm downstream figure. Upstream
  (1310 nm) attenuates differently and is not modelled.
- **No subscriber-level budget.** Reaching an ONT means crossing a drop cable the dataset does not
  describe. Extending to it would first require changing the `network-dataset` capability.
- **No receiver-sensitivity check.** No sourced value for ONT sensitivity exists in the project,
  and inventing one would put an unfounded number next to constants that have a provenance.
- **No changes to `network-dataset`.** This change only reads it.
- **No UI and no map.** Phase 3.
- **No caching or memoisation.** Twelve NAPs at a handful of hops each; a cache would be
  complexity bought against a cost that does not exist.

## Capabilities

### New Capabilities

- `optical-budget`: computing the attenuation of a link from the OLT to a NAP, the margin against
  the applicable GPON budget, and the classification that follows from it.

### Modified Capabilities

None. `network-dataset` is read, not changed — and `rx_power_dbm` finally gives the OLT's declared
transmit power a consumer, which that capability's entity contract already promised it had.

## Impact

- **New files**: `src/lib/optical/constants.ts` and `src/lib/optical/budget.ts`, with their tests.
- **Existing code**: unchanged. The engine reads a `Network` through the existing loader.
- **The fixture becomes load-bearing**: `seed/expected-budgets.json` moves from documentation to
  assertion. Changing an optical constant will fail the suite — deliberately, so that such a
  change has to pass through this spec rather than slip in as a data edit.
- **Downstream**: the next change wraps `calculateBudget` as the model's tool; Phase 3's map reads
  `calculateAllBudgets` to colour every NAP on load without a round trip through the model.
