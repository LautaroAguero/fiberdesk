# Design

## Context

See proposal.md for the why. This design builds on the following state, checked in the code on
2026-10-12, after `add-subscriber-trace` was archived:

- **The tree.** Each NAP has one `parent`, the OLT or another NAP, and exactly one incoming fiber
  run whose `to` is that NAP. There are two cascades: NAP-03 → NAP-12 over FR-12, and NAP-04 →
  NAP-09 over FR-09. Every other NAP hangs straight off the OLT. Subscribers name their serving NAP.
- **The payload is already by kind.** `HighlightEntry` is `nap | subscriber | run`, each with a
  `BudgetStatus`; NAP and subscriber entries also carry `margin_db`. Entries merge by `(kind, id)`,
  and a repeated run keeps the worse status through `worseStatus` in `src/lib/optical/status.ts`,
  which is shared by the projection and the map resolver.
- **The map paints feature-state.** `statusColorExpression` maps `pass` / `marginal` / `fail` to
  colours for NAP and subscriber `status` and for run `onPath`. A highlighted subscriber grows to
  radius 6. MapLibre cannot drive `line-dasharray` from feature-state, so a style that must
  differ per feature has to differ by colour, width or opacity.
- **The highlight grader** returns NAP and subscriber ids only. The case validator accepts only NAP
  and subscriber ids in an oracle.
- **The noise is wide.** In `add-subscriber-trace`, two nearly identical full runs moved the 21
  older cases by three (19/21, then 16/21). A single run is read with that in mind.

Derived during planning by an independent walk of `seed/network.json` (Python, not the engine):

| Cut | NAPs out of service | Subscribers | Runs dark downstream |
|---|---|---|---|
| FR-03 or NAP-03 | NAP-03, NAP-12 | 5 (SUB-006, SUB-025…028) | FR-12 |
| FR-04 or NAP-04 | NAP-04, NAP-09 | 5 (SUB-007, SUB-008, SUB-018…020) | FR-09 |
| FR-12 or NAP-12 | NAP-12 | 4 | — |
| FR-09 or NAP-09 | NAP-09 | 3 | — |
| any other FR-n or NAP-n | NAP-n | 2 or 3 | — |

These match the three values the handoff gives (FR-03 → 5, FR-12 → 4, FR-04 → 5).

## Goals / Non-Goals

**Goals:**

- Every element that loses service, and the counts, from code. The model cites a count and never
  counts a list.
- A cut drawn on the map in a style that cannot be mistaken for a budget classification.
- The existing payload entries, tests and recorded runs unchanged. The new statuses are additive.

**Non-Goals:** see proposal.md: no OLT cut, no partial damage, no rerouting, no multiple cuts, no
upstream effect, no state change, no prompt work beyond the new tool.

## Decisions

### 1. A new pure module: `src/lib/topology/cut.ts`

`cutImpact(network, elementId)` builds a `parent → children` map from `network.splitters`, finds
the subtree root, and walks it breadth-first. The root is the run's `to` NAP for a run, or the NAP
itself for a NAP. The walk collects:

- `naps_out_of_service`: the root and every NAP below it;
- `subscribers_out_of_service`: every subscriber whose `nap` is in that set;
- `runs_out_of_service`: every run whose `from` is in that set.

Each list is sorted by id. The counts are the list lengths, computed in the same function. The
walk carries a visited set and a step bound, like `walkToOlt`, so a hand-built cyclic network
throws instead of looping.

It lives apart from `src/lib/optical/` because it computes no light. It is topology, and
`add-feasibility` will need the same children map to count a splitter's used ports.

*Alternative: put it in `budget.ts`.* That would mix a pure graph walk into the loss engine, with
nothing in common but the tree.

### 2. Result shape

```ts
interface CutImpact {
  element: { kind: "run"; id: string; from: string; to: string }
         | { kind: "nap"; id: string; name: string };
  naps_out_of_service: Array<{ id: string; name: string }>;
  subscribers_out_of_service: Array<{ id: string; name: string; nap_id: string }>;
  runs_out_of_service: string[];          // downstream runs, never the cut run itself
  counts: { naps: number; subscribers: number; runs: number };
}
```

The counts sit in a named object, so the model has a figure to cite for "how many" and grounding
can find it. A NAP cut reports the NAP as `element` and also lists it among
`naps_out_of_service`. A run cut lists its `to` NAP there. Either way, `counts.naps` answers "how
many boxes go down".

### 3. Refusals: the enum stops the OLT, and the engine refuses it for direct callers

- `cutImpact` throws `A cut at the OLT is not supported` for the OLT's id, and
  `Unknown element: <id>` for anything else it does not know.
- The tool's enum lists only the 12 runs and 12 NAPs, so the model cannot send the OLT at all.
  The description says a cut at the OLT is not supported and the assistant should say so.

Owner decision 3 asks for the OLT to get "a plain not supported from the tool". With a strict enum
the call cannot be made, so the refusal reaches the model through the description, before any
call, and through the engine for any direct caller. This is stricter than an error at runtime and
satisfies the decision's intent. The eval case `cut-olt-es` checks the result.

### 4. The tool: `list_cut_impact`

The name follows the rule that a tool is named for the shape of its answer. `summarize_` returns
rows, `detail_` one breakdown, `trace_..._link` one path, and `list_cut_impact` a list of what a
cut takes out, with counts. No other tool name starts with `list_`, so it cannot be confused.

- `strict: true`. `element_id` is an enum of `fiber_runs[].id` followed by `splitters[].id`: 24
  values.
- The description says:
  - it returns everything downstream of a cut of one fiber run or one NAP, through cascades;
  - the counts are in the result, and the model must cite them and never count a list itself;
  - a cut at the OLT is not supported, and the model should say so;
  - an element not in the list does not exist: do not call the tool with another one;
  - a cut here is total and hypothetical, with no partial damage, rerouting or repair time.
- The result is the `CutImpact` JSON.
- The system prompt gains one paragraph saying when to call it. The "cannot answer" list gains the
  OLT cut, and an element id the network lacks.

### 5. Payload: two impact statuses, a single severity order

```ts
type ImpactStatus = "cut" | "out_of_service";
type HighlightStatus = BudgetStatus | ImpactStatus;
type HighlightEntry =
  | { kind: "nap"; id: string; status: BudgetStatus; margin_db: number }
  | { kind: "subscriber"; id: string; nap_id: string; status: BudgetStatus; margin_db: number }
  | { kind: "run"; id: string; status: BudgetStatus }
  | { kind: "nap" | "run"; id: string; status: ImpactStatus }
  | { kind: "subscriber"; id: string; nap_id: string; status: ImpactStatus };
```

`src/lib/optical/status.ts` widens to `HighlightStatus` with the order `pass` 0, `marginal` 1,
`fail` 2, `out_of_service` 3, `cut` 4. `worseStatus` keeps its name and meaning. The module stays
in `optical/` so the client keeps its existing import. The map and the projection share that one
order.

`projectHighlight` adds, for a `list_cut_impact` result:

- the element, with status `cut`;
- each out-of-service NAP, subscriber and run, with status `out_of_service`.

When a merge replaces a budget entry with an impact entry, the impact entry replaces it whole, so
no stale margin survives. `fit_bounds` is true when any NAP, subscriber or cut-run entry exists.

The existing entry shapes are unchanged, so earlier records re-project to exactly what they did.

### 6. Map styles for a cut

Two new style constants go in `src/lib/map/config.ts`, beside the status colours:

- **`CUT_COLOR`:** a saturated magenta, used for a run at width 6 and for a NAP circle ring. It
  sits outside the green, amber and red family of the budget colours.
- **`OUT_OF_SERVICE_COLOR`:** a dark slate grey, used for NAPs, subscribers and dark runs. Dark
  runs are drawn at a path's width (4) and 0.85 opacity, so the subtree reads as switched off.
  *Changed during task 2.3:* the first version drew them at the neutral width and 0.4 opacity, and
  in the browser that washed out to the neutral fiber grey, so it could not be told apart from an
  unaffected run.

`statusColorExpression` gains the two keys. Line width and opacity get their own feature-state
expressions, because a dash cannot be data-driven. `resolveHighlight` keeps its shape, with maps
typed `Record<string, HighlightStatus>`, and merges by the same severity order.

The click breakdown is unchanged.

### 7. Evals

- `highlightIds` returns the ids of NAP and subscriber entries, plus run entries whose status is
  `cut`.
- The case validator accepts fiber run ids in an oracle, in addition to NAPs and subscribers.
- `AREAS` gains `cut`, with six cases written by hand:

| Case | Turn(s) | Expectations |
|---|---|---|
| `cut-feeder-cascade-es` | "¿qué pasa si se corta el tendido FR-03?" | `list_cut_impact` {FR-03}; highlight = {FR-03, NAP-03, NAP-12, SUB-006, SUB-025, SUB-026, SUB-027, SUB-028}; grounding; figures 5 |
| `cut-leaf-en` | "what goes down if fiber run FR-12 is cut?" | {FR-12}; highlight = {FR-12, NAP-12, SUB-025…028}; grounding; figures 4 |
| `cut-nap-es` | "¿qué clientes se quedan sin servicio si se cae la NAP-04?" | {NAP-04}; highlight = {NAP-04, NAP-09, SUB-007, SUB-008, SUB-018, SUB-019, SUB-020}; grounding; figures 5 |
| `cut-unknown-es` | "¿qué pasa si se corta el FR-99?" | abstention |
| `cut-olt-es` | "¿qué pasa si se cae el OLT?" | abstention (a stated count of 28 would be an ungrounded figure) |
| `cut-count-followup-es` | "¿qué pasa si se corta FR-04?" then "¿cuántos clientes son?" | grounding; figures 5 |

A unit test checks every figure and oracle id in these cases against
`seed/expected-cut-impacts.json`.

Grounding cannot tell a cited count from a list the model counted correctly. Both produce a 5 that
appears in the tool result. The case still catches a wrong count, which is the failure that
matters, and the description and the result's `counts` object push the model to cite the figure.

### 8. The oracle is hand-derived

`seed/expected-cut-impacts.json` holds 24 entries, one per run and per NAP. Each entry has the
element kind, the out-of-service NAPs, subscribers and runs, and the counts. It is written by hand
from the tree, which is small enough to read: 12 NAPs, two cascades, 28 subscribers. It also
carries a `_note` like the other fixtures. A separate test asserts the handoff's three
cross-check values directly, so a slip in the hand-written file cannot also hide in the test.

*Alternative: a script, as for the traces.* The traces needed one, because 28 haversine distances
are not hand work. Here the "computation" is reading a two-level tree, and a script would
reimplement the same walk as the engine.

### 9. One live run, read against the wider noise

1. A smoke run of `cut-*` under a $0.40 cap.
2. A full run (34 cases) under a $2.00 cap.
3. `eval:compare` against `add-subscriber-trace`'s run of record,
   `evals/runs/2026-10-12T14-05-31Z.regraded.json`. Read every flip by hand. A stable case that
   regresses through the cut tool or its prompt paragraph is fixed before archiving. A flip on
   arithmetic in prose is recorded as the known weakness, with the three-case noise in mind.

## Risks / Trade-offs

- **[The model lists the subscribers and counts them]** → `counts` is in the result, the
  description says to cite it, and a miscount is ungrounded. A correct self-count passes
  undetected (decision 7).
- **[The model answers an OLT question by reasoning that everything goes down]** → `cut-olt-es`
  is an abstention case, and "28 subscribers" or "12 NAPs" would be ungrounded figures, because
  no tool states them.
- **[A cut paints most of a branch dark, and the map gets noisy]** → only the subtree is painted.
  The largest cut in the seed is 2 NAPs and 5 subscribers.
- **[Impact statuses overwrite a margin the user just asked about]** → this is intended, because an
  outage is the more urgent fact. The prose still carries the margin from the tool result.
- **[The payload grows another variant]** → the variants are additive, and earlier entries and
  recorded runs keep their meaning. `add-feasibility` will add a `point` kind the same way.

## Migration Plan

1. The engine and the oracle, under unit tests.
2. Statuses, projection, resolver, map and grader, with the existing tests unchanged and passing.
3. The tool, the prompt and the cases.
4. Live smoke and full runs, then a check in the app.

There is no data migration, and rollback is a revert.

## Open Questions

None blocking.
