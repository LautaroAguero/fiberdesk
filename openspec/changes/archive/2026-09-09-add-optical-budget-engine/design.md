# Design — optical budget engine

## Context

`network-dataset` is in place: `src/lib/network/` loads and validates the seed, and
`seed/expected-budgets.json` already records the outcome every NAP should produce. See
`proposal.md` — *Why* for motivation and `specs/optical-budget/spec.md` for the contract.

One consequence of the previous change shapes this one: the loader guarantees a single root, no
cascade cycles and resolving references, so a `Network` that came through it is a tree and the
walk up to the OLT is guaranteed to terminate.

The consumer that matters is the next change, where the model calls this per NAP and then explains
the result in words. That is what makes the *breakdown*, not the total, the interesting part of the
output.

## Goals / Non-Goals

**Goals:**

- One place where every optical constant lives, so changing one is a visible, deliberate act.
- Output detailed enough that an explanation can be assembled by reading it, never by inferring.
- A single implementation of the arithmetic, with no second path that can drift.
- Results reproducible to the digit, because that is the property the whole product rests on.

**Non-Goals (design level):**

- Designing the tool schema the model will see. That belongs with the conversational layer.
- Any performance work. Twelve NAPs of a few hops each.
- Modelling the physics beyond the loss model the project already documents.

## Decisions

### 1. The class budget decides pass/fail; transmit power is informational

Two formulations are in common use: compare accumulated loss against the GPON class budget, or
subtract loss from transmit power and compare the result against receiver sensitivity. The project
brief commits to the first — B+ is 28 dB — and the committed fixture is built on it.

The second formulation would produce different headroom and would stop NAP-09 failing, dismantling
the edge cases the dataset exists to demonstrate.

So the first formulation stands. But the OLT declares a transmit power that, under it, nothing
consumes. Rather than leave an orphan field, the engine reports `rx_power_dbm` — transmit power
less total attenuation — as an informational value with no vote in the classification. It is the
number an installer reads off an ONT, and it gives the declared field a purpose.

*Alternative considered:* leave `tx_power_dbm` unused and note it. Rejected — the `network-dataset`
spec claims every entity carries every field needed to compute a budget, and that claim should be
true rather than loosely true.

### 2. The constants module separates physics from policy

Fiber attenuation, connector and splice loss, splitter insertion loss and the per-class GPON budget
are properties of glass and hardware. The 3 dB minimum margin is not: it is an operational
recommendation an operator could set at 2 or at 5.

They live in the same module but are visibly separated, and the minimum margin is documented as a
recommendation. Mixing them into one undifferentiated list invites treating a policy choice as a
physical fact.

### 3. The fiber constant is named for its wavelength

The project brief's figure is fiber attenuation at 1490 nm — the GPON *downstream* wavelength.
Upstream, at 1310 nm, attenuates differently. The constant is named and commented for the
downstream direction so it cannot be quietly reused for the other one, and the spec limits the
engine to downstream.

### 4. GPON classes are objects, not bare numbers

`GPON_CLASS["B+"].budget_db` rather than `GPON_BUDGET["B+"]`. It costs one property access today
and makes a second per-class field — receiver sensitivity being the obvious candidate — additive
rather than a change to every call site.

This is the one concession to a future need in this change. Receiver sensitivity itself is
deliberately not added: no sourced value exists, and an unfounded number sitting beside constants
that have a provenance is how an invented figure gets cited as fact later.

### 5. The fixture's copy of the loss model is a tripwire, not duplication

`seed/expected-budgets.json` carries its own frozen copy of the loss values that produced its
numbers. The engine reads the constants module instead.

```
  constants.ts --feeds--> engine --produces--> 25.23 dB
                                                   |
                                                compare
                                                   |
  expected-budgets.json --records--> 25.23 dB <-----+
     (frozen copy of the loss model)
```

If someone edits a constant, the tests fail. That is the point: an optical constant is
pending validation, and changing one has to travel through this spec rather than land as a quiet
data edit. Importing the constants from the fixture instead would make the test circular — it would
confirm the engine agrees with itself.

### 6. The batch function is a map, not a second implementation

`calculateAllBudgets(network)` is `network.splitters.map(...)` over the single-NAP function, and the
spec requires the two to agree field for field.

Phase 3 needs it for real: the map colours all twelve NAPs on load, before any question is asked,
and without it that loop ends up inside a React component — optical calculation in the UI layer.
But two independent implementations are two things that can disagree, and the day they disagree the
product has two answers to one question.

The tool exposed to the model stays the single-NAP one, so that the reference use case's twelve
parallel calls remain what the brief describes.

### 7. Accumulate at full precision, round once at the boundary

Rounding each component before summing and rounding only at the end were compared against the
fixture across all twelve NAPs: they agree everywhere. That agreement is a property of these
particular lengths, not a guarantee, so the rule is pinned rather than inherited from luck.

Every number leaving the engine is rounded to two decimals through one helper, so there is a single
place where precision policy lives.

### 8. The traversal keeps a cycle guard the loader already makes redundant

A `Network` from the loader cannot contain a cascade cycle. A `Network` assembled by hand in a test
can. The walk keeps a visited set and raises rather than looping forever — three lines against a
hang that would otherwise be diagnosed as a stuck test run.

### 9. Shape of the result

```
  +-- summary -----------------------------------------------+
  |  nap_id, gpon_class, budget_db, min_margin_db            |
  |  total_loss_db, margin_db, status, rx_power_dbm          |
  +-- by source ---------------------------------------------+
  |  fiber_db, splitters_db, connectors_db, splices_db       |
  +-- by hop (ordered, OLT first) ---------------------------+
  |  run id, from, to, length_km, fiber_db,                  |
  |  splitter { at, ratio, loss_db },                        |
  |  connectors + connectors_db, splices + splices_db        |
  +----------------------------------------------------------+
```

The per-hop level exists because the reference use case's explanation names the upstream NAP
responsible for an inherited splitter. Without attribution per hop, that sentence can only be
produced by guessing, and guessing is the failure mode this project is built to avoid.

The batch function returns an array ordered as `network.splitters`, not a map — callers that want
lookup by id can build one, and an array preserves a stable order for rendering.

## Risks / Trade-offs

- **The tripwire will surprise whoever first edits a constant** → a whole test file failing on a
  one-character change reads as breakage. Mitigation: the failure message and this document say it
  is deliberate, and the spec states that a constant change is a spec change.
- **`rx_power_dbm` may be read as a pass/fail input** → it sits beside `margin_db` and looks
  equally authoritative. Mitigation: the spec states explicitly that it does not classify, and one
  scenario asserts a failing link that reports a plausible received power.
- **The loss constants remain pending validation** → every number in the spec's scenarios moves if
  one changes. Accepted: that is precisely why they are centralised and why the fixture is bound to
  the tests.
- **Downstream-only is a real limitation** → an upstream budget is a genuine engineering question
  this engine cannot answer. It is a stated non-goal rather than an oversight, and the constant's
  name makes the limit visible at the point of use.
- **The per-hop payload is larger than most callers need** → twelve NAPs of a few hops each, so the
  cost is negligible now; it would matter only if the network grew by orders of magnitude.

## Migration Plan

Not applicable. Purely additive, with no existing consumers; rollback is deleting the added files.

## Open Questions

- Should Phase 3's map read a lighter result without the per-hop breakdown, to keep what crosses to
  the browser small? Deferrable: it is a narrowing of an existing shape, changes no scenario here,
  and the map's actual payload budget is not knowable until it exists.
