# Design

## Context

See proposal.md for the why. This design builds on the following state, checked in the code on
2026-10-12:

- **The seed already models subscribers.** `Subscriber { id, name, lat, lon, nap }`: 28 of them,
  2–4 per NAP, named `Subscriber 001` … `Subscriber 028` with ids `SUB-001` … `SUB-028`. The map
  draws them as the `subscribers` source, with `promoteId: "id"`, so feature-state already works on
  them. No tool reads them.
- **The NAP engine is the base.** `calculateBudget(network, napId)` walks the parent chain once and
  returns `BudgetResult` with ordered `hops`, `by_source`, `total_loss_db`, `margin_db`, `status`
  and `rx_power_dbm`. It rounds the total once and derives margin and power from the reported
  total, because figures should add up the way they do on a page (see the NAP-11 note in
  `budget.ts`).
- **The payload is NAP-only.** `HighlightEntry { nap_id, status, margin_db }`. `projectHighlight`
  turns only `detail_optical_budget` results into entries. `resolveHighlight(payload, network,
  budgets)` derives the runs from `budgets[].hops`. The eval grader's `highlightIds` reads
  `entry.nap_id`, and five budget cases and one docs case use `equals` mode.
- **Constants and fixture discipline.** Every loss value lives in `src/lib/optical/constants.ts`,
  marked pending validation. `seed/expected-budgets.json` carries a frozen copy of the constants
  that produced it, and `constants.test.ts` compares the two.
- **The model is unchanged since `reduce-cost-per-question`:** `claude-opus-5`, effort `low`, prompt
  caching on. B1 and B2 differ on one case in 21. That noise floor is the reference for reading
  regressions on the existing cases after this change.

Computed during planning with an independent script (Python, haversine, not the engine):

- every seed subscriber sits 346–383 m in straight line from its NAP;
- with slack 1.3 and 2 connectors, every drop costs 0.91–0.92 dB;
- three subscribers change classification against their NAP: SUB-011, SUB-012 and SUB-013 on
  NAP-06, which go from pass to marginal (margins 2.52 / 2.52 / 2.53 dB);
- no other subscriber changes classification.

## Goals / Non-Goals

**Goals:**

- One subscriber's end-to-end budget, every figure from code, attributable to a hop or to the drop.
- A payload that can name a subscriber and a run today, and a cut set or a point later, without
  another breaking change.
- The 21 existing eval cases unaffected by the payload change. The highlight grader compares the
  same NAP ids it compares today.

**Non-Goals:** see proposal.md. In short: no ONT sensitivity, no drop geometry, no subscriber click
card, no listing of subscribers, no scale-out lookup, no maximum drop distance, no prompt work
beyond the new tool.

## Decisions

### 1. The trace wraps the NAP's budget; it never walks the tree again

`traceSubscriber(network, subscriberId)` looks up the subscriber, calls
`calculateBudget(network, subscriber.nap)` and adds the drop. The NAP part of the result is that
`BudgetResult`, unchanged, so a subscriber's path is by construction the same path the NAP's
detail and the map already show.

*Alternative: walk from the subscriber.* That would be a second walker to keep in sync with the
first, which is the duplication `resolveHighlight` was designed to avoid in add-map-copilot.

### 2. Rounding: reported figures add up, as in the NAP engine

| Figure | Rule |
|---|---|
| `drop.straight_line_km` | round3(haversine distance) |
| `drop.length_km` | round3(raw distance × slack) |
| `drop.fiber_db` | round2(raw length × `FIBER_DB_PER_KM`) |
| `drop.connectors_db` | round2(`DROP_CONNECTORS` × `CONNECTOR_DB`) |
| `drop.loss_db` | round2(`drop.fiber_db` + `drop.connectors_db`), from the reported values |
| `total_loss_db` | round2(`nap.total_loss_db` + `drop.loss_db`) |
| `margin_db` | round2(`budget_db` − `total_loss_db`) |
| `rx_power_dbm` | round2(`tx_power_dbm` − `total_loss_db`) |
| `by_source` | the NAP's by-source figures, plus `drop.fiber_db` on fiber and `drop.connectors_db` on connectors, each round2 |

Every link figure is computed from figures the result also reports. A reader, or the model, can
check any line against the line above it without re-opening float precision. The model never has
to add the drop to the NAP total itself: the tool already did.

### 3. Distance: haversine on the mean Earth radius, in its own helper

The straight-line distance is the great-circle distance by the haversine formula, with the IUGG
mean Earth radius of 6,371.0088 km. It lives in `src/lib/geo/distance.ts`, not in the optical
constants: it is geometry, not optics. The radius gets the same unit-and-source comment.

At 350–400 m an equirectangular approximation would agree to well under a metre. Haversine is
chosen because it is the standard formula and holds up at any distance, which feasibility will
need. One planning value sits near a rounding boundary: SUB-026's straight line is
0.3525013 km. The spec does not assert that value; tests take it from the oracle.

### 4. Drop constants: owner-chosen, pending validation, frozen in the oracle

```ts
/** Route length of a drop over its straight-line distance. Dimensionless. Pending validation. */
export const DROP_SLACK_FACTOR = 1.3;
/** Connectors a drop adds: the NAP port and the ONT. Count. Pending validation. */
export const DROP_CONNECTORS = 2;
```

Source: owner decision 2 in the handoff (2026-10-07), recorded there as industry-typical starting
points. No published source is cited for them, so the comments say exactly that. The same applies
to the README, which lists both as assumptions next to the other constants. The drop's fiber loss
reuses `FIBER_DB_PER_KM` and its connector loss reuses `CONNECTOR_DB`.

`seed/expected-traces.json` carries its own frozen copy of all four values (slack, connectors per
drop, fiber dB/km, connector dB), and `constants.test.ts` compares them, as it does for
`expected-budgets.json`.

### 5. The oracle is an independent derivation, committed with its script

A hand computation of 28 haversine distances is not realistic. Instead, the oracle is produced by
`seed/derive-expected-traces.py`, which:

- uses only the Python standard library, never the TypeScript engine;
- reads the raw `seed/network.json` and the NAP totals from `seed/expected-budgets.json`, itself
  hand-derived;
- writes the per-subscriber figures with the rounding rules of decision 2.

Both the script and its output are committed. The independence comes from a second implementation
in another language, written from the spec rather than from the engine. If the two disagree, one
of them is wrong, which is the same contract `expected-budgets.json` has. The planning figures in
the spec came from an earlier version of this script.

*Alternative: generate the fixture from the engine.* That only proves the engine agrees with
itself.

### 6. The tool: `trace_subscriber_link`

The name follows the existing rule: name the shape of the answer, not the operation. `summarize_`
returns rows, `detail_` returns one NAP's breakdown, and `trace_..._link` returns one subscriber's
link traced end to end. It cannot be confused with `detail_optical_budget`.

- `strict: true`, `subscriber_id` is an enum of `network.subscribers[].id`.
- The description says:
  - use it for a question about a specific subscriber or customer;
  - identifiers look like `SUB-014` and match the subscriber named "Subscriber 014";
  - a passing NAP does not mean its subscribers pass;
  - the drop is a modelled estimate, and received power is an estimate with no receiver
    sensitivity behind it.
- The result is JSON:
  - top level: `subscriber_id`, `subscriber_name`, `nap_id`, `nap_name`, `gpon_class`,
    `budget_db`, `min_margin_db`;
  - `nap`: the NAP's `BudgetResult`;
  - `drop`: `straight_line_km`, `slack_factor`, `length_km`, `fiber_db`, `connectors`,
    `connectors_db`, `loss_db`;
  - link totals: `by_source`, `total_loss_db`, `margin_db`, `status`, `rx_power_dbm`.
- An unknown id is impossible through the enum. The dispatcher still refuses one by name, through
  the engine's error, for a direct caller.

The system prompt gains one paragraph saying when to call it. Two items join its "cannot answer"
list: a subscriber id the network lacks, and whether an ONT will work. The second extends the
existing ONT-sensitivity item.

### 7. The payload: a discriminated union by kind

```ts
export type HighlightEntry =
  | { kind: "nap"; id: string; status: BudgetStatus; margin_db: number }
  | { kind: "subscriber"; id: string; nap_id: string; status: BudgetStatus; margin_db: number }
  | { kind: "run"; id: string; status: BudgetStatus };
export interface HighlightPayload { highlight: HighlightEntry[]; fit_bounds: boolean }
```

`projectHighlight` adds entries as follows:

- `detail_optical_budget` → the NAP, plus one run per `hops[].run_id` with the NAP's status;
- `trace_subscriber_link` → the subscriber, plus one run per `nap.hops[].run_id` with the
  subscriber's status. The NAP itself is not added.

Entries merge by `(kind, id)`. A repeated run keeps the worse status (`fail` > `marginal` >
`pass`). `fit_bounds` is true when any NAP or subscriber entry exists.

Runs are explicit in the payload rather than derived by the map, so the payload states everything
to paint. This is what `add-cut-impact` needs: there, the cut element is a run and the affected
subtree is a set, with nothing to derive from a NAP. A future `point` kind for feasibility is a new
union member, not another reshaping.

*Alternative: keep NAP entries and let the map derive paths from budgets, as today.* That works
for NAPs, but a subscriber's path would then need the map to look up its NAP's budget. Cut impact
would need yet another derivation. Making the payload explicit costs a few more entries per turn.

### 8. The map paints what the payload names

`resolveHighlight(payload, network)` loses its `budgets` argument. It returns:

- `napStatus`, `subscriberStatus` and `runStatus`;
- `runIds`;
- `unknownIds`: anything absent from the network;
- `bounds`: the OLT, the highlighted NAPs and subscribers, and every vertex of the listed runs.

`NetworkMap` sets feature-state `status` on the `subscribers` source, as it already does for NAPs,
and clears the previous subscriber set on replacement. The subscriber circle layer gets the same
status colour expression as NAPs, and a larger radius when highlighted. `Copilot` stops passing
`budgets` to the resolver; it still passes them to the click breakdown.

### 9. Evals: compare subjects, not paths; a `trace` area

- `highlightIds(payload)` returns the ids of NAP and subscriber entries. Existing `equals` oracles
  such as `["NAP-09", "NAP-12"]` keep matching, and so does `[]` for the docs case.
- The case validator accepts oracle ids that are NAPs or subscribers.
- `AREAS` gains `trace`. Seven new cases, all hand-written:

| Case | Question (turn) | Expectations |
|---|---|---|
| `trace-cascade-es` | "¿por qué el abonado SUB-025 tiene poca señal?" | trace SUB-025; highlight = {SUB-025}; grounding; figures 26.15, 1.85 |
| `trace-direct-en` | "what is the optical budget for subscriber SUB-001?" | trace SUB-001; highlight = {SUB-001}; grounding; figures 13.26, 14.74 |
| `trace-failing-es` | "¿cómo está el enlace del abonado SUB-018?" | trace SUB-018; highlight = {SUB-018}; grounding; figures 30.32, −2.32 |
| `trace-nap06-es` | "La NAP-06 cierra el presupuesto. ¿El abonado SUB-011 también?" | trace SUB-011; highlight ⊇ {SUB-011}; grounding; figures 2.52 |
| `trace-by-name-es` | "¿qué margen tiene el cliente Subscriber 014?" | trace SUB-014; highlight = {SUB-014}; grounding; figures 11.40 |
| `trace-unknown-es` | "¿cómo está el abonado SUB-099?" | abstention, like `abstain-nap13-es` |
| `trace-ont-verdict-es` | "¿al abonado SUB-018 le va a funcionar la ONT?" | grounding only (see below) |

`trace-ont-verdict-es` cannot use the abstention grader. That grader fails any highlight, and the
model may legitimately trace SUB-018 before saying it cannot give a verdict. Grounding catches the
failure that matters most, an invented sensitivity threshold, as an ungrounded figure. Whether the
prose actually declines is read by hand in the live run (decision 10), as every abstention case is
today.

A unit test checks every figure in these cases against `seed/expected-traces.json`, as the
existing "oracle agrees with the expected budgets" test does.

### 10. One live run, read against the noise floor

The prompt hash changes, because the toolset and system prompt change, so earlier records are not
comparable by `eval:decide`. That rule exists for the cost question anyway. Instead:

1. A smoke run of `trace-*` under a $0.40 cap.
2. One full run (28 cases) under a $2.00 cap.
3. `eval:compare` against B2 for the 21 existing cases. Every case that went pass → fail is read by
   hand against the noise floor (B1 and B2 differ on one case, `conv-and-nap12-es`). The reading
   goes in this change's `verification.md`. A stable case that regresses because of the new tool
   is a finding to fix before archiving, not noise.

### 11. Scale limit, recorded and not built

The enum embeds all 28 identifiers in a tool schema the model reads on every call. At real-ISP
scale, with thousands of subscribers, the enum would dominate the prompt. The answer there is a
search tool that resolves a name, address or id to one subscriber, followed by this trace tool
taking a validated id. Nothing is built for it here. The README names the limit.

### 12. A finding handed to `add-feasibility`

The handoff suggests a maximum drop of about 300 m. Every seed subscriber is 346–383 m in straight
line from its NAP, so 450–498 m with slack 1.3. Under that maximum, no existing subscriber would be
feasible from its own NAP. `add-feasibility` has to decide whether the maximum, the slack or the
seed is what moves. This change records the finding here, for that proposal to start from, and
changes none of them.

## Risks / Trade-offs

- **[The payload break ripples]** → It touches four code paths: the projection, the resolver, the
  map and the grader. Each has unit tests, and the existing scenarios are kept. Recorded runs
  re-grade, because `regradeRecord` projects again from stored tool results. The stored
  `highlight_ids` were NAP ids and remain NAP ids.
- **[The model adds the drop itself]** → If it details the NAP and writes "plus about 1 dB of
  drop", grounding catches the figure. The tool description and the prompt point a subscriber
  question at the trace tool, which returns the totals already added.
- **[The model treats NAP status as subscriber status]** → The `trace-nap06-es` case exists to
  catch it, and the tool result carries both statuses side by side.
- **[A fifth tool shifts behaviour on old cases]** → Decision 10's comparison is there for that,
  and the cached prefix grows by roughly 300 tokens.
- **[Haversine at a rounding boundary]** → SUB-026's straight line is 0.3525013 km. Tests read the
  oracle, and the oracle and the engine use the same radius and formula from the spec.
- **[Unvalidated drop constants presented as fact]** → The comments, the README and the tool
  description all mark the drop as modelled. The result exposes the slack factor and the straight
  line so the assumption is visible in every answer that uses it.

## Migration Plan

1. Engine, constants and oracle, under unit tests.
2. Payload, projection, resolver, map and grader. The existing tests are updated to the new shape
   and pass.
3. Tool and prompt, with the eval cases.
4. Live smoke run and full run, then a check in the app, read by hand.

There is no data migration. Browser conversations carry payloads only per turn, and none is
stored. Rollback is a revert: no record format changes, apart from what the grader reads off the
payload at re-grade time.

## Open Questions

None blocking. The validation of the drop constants against a real source stays open with the
other constants.
