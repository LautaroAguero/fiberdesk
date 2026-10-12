# Design

## Context

See proposal.md for the why. This design builds on the following state, checked in the code on
2026-10-12, after `add-cut-impact` was archived:

- **The drop lives inside the trace.** `traceSubscriber` (`src/lib/optical/trace.ts`) computes the
  straight line with `haversineKm`, the route as straight × `DROP_SLACK_FACTOR`, then the drop
  fiber, connector and total losses with `round2`. Nothing else can reuse it today.
- **The route receives only `messages`.** `isChatRequestBody` checks for a non-empty array. The
  loop, `runAssistantLoop`, passes `network` and `searchIndex` to `runToolUse` →
  `dispatchTool(name, input, network, searchIndex)`. A tool has no way to see the request.
- **Regrade re-dispatches.** `src/lib/evals/regrade.ts` calls `dispatchTool` with the recorded
  name and input and compares a SHA-256 of the result. A tool whose output depends on anything
  other than its input breaks that, unless the extra input is recorded too.
- **The map is clickable only on NAPs.** `map.on("click", "naps-circle", …)` calls
  `onSelectNap`. There is no click handler for the rest of the map.
- **City bounds already exist.** `CITY_BOUNDS` in `src/lib/network/validate.ts` is
  lat −27.5 to −27.4, lon −59.05 to −58.93. The loader checks every seed coordinate against it.
- **The grounding grader has no unit conversion.** A route stated as "593 m" is grounded only if
  593 appears in a tool result. 0.593 is not enough.
- **Prompt caching is on.** The prefix is the tools plus the system prompt. Anything that varies
  per request must stay out of it.

Derived during planning with an independent script (Python, haversine, IUGG radius, not the
engine). The seed has these port counts and NAP spacings:

- the closest NAP pair is NAP-05 and NAP-11, 890 m apart;
- free ports: NAP-03 has 0, NAP-10 has 2, NAP-01, NAP-04 and NAP-09 have 5, NAP-05 and NAP-07 have 6,
  NAP-12 has 12, NAP-02, NAP-08 and NAP-11 have 14, and NAP-06 has 29.

Results for the eval points:

| Point | Candidates (route, verdict) | Best |
|---|---|---|
| A (-27.4165, -59.0180) | NAP-03 217 m, `no_free_ports` · NAP-08 3252 m, `too_far` · NAP-12 3549 m, `too_far` | none |
| B (-27.4955, -58.9380) | NAP-09 217 m, `budget_fail` (−2.25 dB) · NAP-04 `too_far` · NAP-05 `too_far` | none |
| C (-27.4432, -58.9770) | NAP-01 205 m, feasible (14.81 dB) · NAP-11 `too_far` · NAP-05 `too_far` | NAP-01 |
| D (-27.4930, -59.0338) | NAP-06 539 m, feasible, marginal (2.51 dB) · NAP-02 `too_far` · NAP-08 `too_far` | NAP-06 |
| E (-27.4659, -58.9700) | NAP-11 564 m, feasible (11.39 dB) · NAP-05 593 m, feasible (13.83 dB) · NAP-04 `too_far` | NAP-11 |
| F (-27.4300, -58.9400) | NAP-10 3181 m · NAP-07 3244 m · NAP-01 5307 m, all `too_far` | none |

The longest seed drop is SUB-025's: 497.8 m of route, inside 600 m with 102 m to spare.

## Goals / Non-Goals

**Goals:**

- Every distance, port count, projected figure and verdict from code. The model picks the tool and
  explains.
- The point reaches the tool without the model ever copying a coordinate, and without the prompt
  prefix changing per request.
- The trace's numbers, its oracle and every recorded run stay byte-identical.

**Non-Goals:** see proposal.md. Design-level additions:

- no click-to-evaluate shortcut that skips the chat;
- no persistence of the point across page reloads.

## Decisions

### 1. One drop function, `src/lib/optical/drop.ts`

```ts
export function modelDrop(from: Position, to: Position): SubscriberDrop
```

The function holds the exact code now inside `traceSubscriber`:

- straight-line km by haversine;
- route = straight × `DROP_SLACK_FACTOR`;
- `fiber_db = round2(route × FIBER_DB_PER_KM)`, `connectors_db = round2(DROP_CONNECTORS ×
  CONNECTOR_DB)`, `loss_db = round2(fiber + connectors)`;
- km rounded to three decimals.

`traceSubscriber` calls it and changes nothing else.

*Changed during task 6.2:* the drop also states `straight_line_m` and `length_m`, the reported km
restated in whole metres. In the first full live run, `trace-by-name-es` had passed in the three
runs before it. This time it wrote "383 m en línea recta", converting the trace's 0.383 km into
metres, a figure no tool returned. The likely trigger is the new tool's metres. This applies decision
3's rule, "both units, so the model never converts", to the trace as well. The trace's figures are
unchanged, but its result gains two fields. Recorded trace results therefore no longer hash the
same, and older runs re-grade those cases as recorded. `SubscriberDrop` moves with it and is
re-exported from `trace.ts`, so no import breaks. A new subscriber at a point gets a link computed
the way a subscriber's link is. That shared step goes in one helper too:

```ts
export function projectLink(napBudget: BudgetResult, drop: SubscriberDrop):
  { by_source; total_loss_db; margin_db; status }
```

Both the trace and feasibility call it, so "the projection matches SUB-025's trace" holds by
construction. The unit test still checks it against the oracle.

*Alternative: copy the five lines into feasibility.* Two copies of a pending-validation model would
drift the first time a constant's use changes. The trace oracle would keep passing while
feasibility went wrong.

### 2. Free ports in `src/lib/topology/ports.ts`

```ts
export function freePorts(network: Network): Map<string, { outputs; subscribers; child_naps; free }>
```

`outputs` is parsed from the ratio's right-hand side (`"1:16"` → 16). This is the only place a
ratio becomes a number of ports, and the splitter loss table stays keyed by the string. If
`free < 0`, the function throws `NAP-xx is oversubscribed: …`. It sits beside `cut.ts` because it
is topology, not light.

### 3. The engine: `src/lib/feasibility/feasibility.ts`

```ts
export const CANDIDATE_COUNT = 3; // product choice (owner, 2026-10-12), not physics

interface ConnectionCandidate {
  rank: number;                       // 1-based, after sorting
  nap_id: string; nap_name: string; ratio: SplitterRatio;
  straight_line_m: number;            // rounded to the metre
  route_m: number;                    // rounded to the metre
  ports: { outputs: number; subscribers: number; child_naps: number; free: number };
  drop: SubscriberDrop;               // exactly as the trace states it (km)
  nap_total_loss_db: number; nap_margin_db: number; nap_status: BudgetStatus;
  projected: { by_source; total_loss_db; margin_db; status: BudgetStatus };
  feasible: boolean;
  reasons: Array<"too_far" | "no_free_ports" | "budget_fail">;  // empty when feasible
}

interface ConnectionFeasibility {
  point: { lat: number; lon: number };   // echoed as given
  gpon_class; budget_db; min_margin_db;
  max_drop_route_m: number;             // 600
  candidates: ConnectionCandidate[];    // length CANDIDATE_COUNT, ranked
  best_nap_id: string | null;
  feasible_count: number;
}
```

The steps:

1. Validate the point against `CITY_BOUNDS`. The bounds and the check move from `validate.ts` into a
   small exported `isInsideCity(position)`, so the loader, the route, the case loader and the
   engine share one definition.
2. Sort every NAP by unrounded straight-line distance, ties by id, and take the first three.
3. For each NAP, compute the drop (decision 1), its ports (decision 2), its budget
   (`calculateBudget`) and the projection.
4. Set `reasons` in fixed order:
   - `too_far` when `route_m > MAX_DROP_ROUTE_M`;
   - `no_free_ports` when `free ≤ 0`;
   - `budget_fail` when the projected status is `fail`.
5. Sort feasible first, then by distance. Assign ranks.

`too_far` compares the reported, rounded `route_m` with 600. Then a reader who sees "600 m" never
sees a verdict that contradicts it. The trace's convention is the same: every line can be checked
against the one above it.

Distances appear in metres at the top level of the candidate, and in km inside `drop`, which is
shared with the trace. Both carry the same distance. "593 m" and "0.593 km" are then both
grounded, and the model has no reason to convert units.

*Alternative: only the candidates within reach.* That was rejected by the owner: `too_far` could
never appear, and an out-of-coverage point would return an empty list with nothing to explain.

### 4. The constant: `MAX_DROP_ROUTE_M = 600`

It goes in `constants.ts` below `MIN_MARGIN_DB`, in the operational block, with a comment:

- route length, not the straight line, in metres;
- source: owner decision, 2026-10-12, set so that the seed's existing drops (≤ 498 m) are within
  reach;
- no published source cited, PENDING VALIDATION.

The constants snapshot (`optical-constants.ts`) exposes it as `max_drop_route_m`, marked
operational like `min_margin_db`. The handoff's "~300 m" is recorded in the comment as the figure
that was rejected, and why.

### 5. Map context: a request field the tool reads, never a prompt edit

```ts
interface MapContext { selected_point?: { lat: number; lon: number } }
```

- **Route:** `ChatRequestBody` gains `map_context?: MapContext`. The route validates it before
  any model call. A malformed or out-of-city point is a 400 naming the problem. A missing field is
  `{}`.
- **Loop:** `RunAssistantLoopParams` gains `mapContext?: MapContext`, and passes it to `runToolUse`.
- **Dispatcher:** `dispatchTool(name, input, network, searchIndex, mapContext = {})`. It is a
  defaulted fifth parameter, so the five existing tools and their tests are untouched.
- **Tool:** reads `mapContext.selected_point`. With none, it returns the error *"No point is
  selected on the map. Ask the user to click the map where the new customer would connect. Do not
  guess a location."*

**How the model learns a point is selected: it does not need to.** The tool is the only channel.
Asked "¿puedo conectar acá?", the model calls the tool. With a point, it gets candidates. Without
one, it gets the error that tells it what to ask. Nothing is added to the system prompt or the
messages, so:

- the cached prefix is identical for every point;
- the history the client resends carries no stale "point selected" markers;
- the point the model talks about is always the one echoed in a tool result, so its coordinates
  are grounded.

*Alternative: append "[map: a point is selected]" to the user turn.* It would sit in the history
forever and go stale the moment the user moved the point. It would also tempt the model to answer
without calling the tool.

*Alternative: put the point in the system prompt.* That breaks the cache on every click.

A follow-up after the user moves the point calls the tool again and gets the new point. The older
tool result in the history still names its own point, so nothing is ambiguous.

### 6. The tool: `list_connection_candidates`

The name follows the shape rule: `list_` returns a list, like `list_cut_impact`, and the noun says
what is listed. `strict: true`, with an empty `properties` object and no required field.

The description says:

- it evaluates the point the user selected on the map, with no arguments;
- it always returns the three nearest NAPs, each with its verdict and every failing reason, the
  best candidate and the feasible count;
- distances are in metres and the drop is a modelled estimate;
- if no point is selected, ask the user to click the map, and never guess or accept typed
  coordinates;
- it says nothing about whether an ONT will work.

The system prompt gains one paragraph saying when to call it, and that a follow-up about another
candidate is answered from the result already in the conversation. The "cannot answer" list gains
two items: a location given as coordinates or an address, where the model asks for a click; and
whether the new ONT will work.

### 7. Payload: `point` and `candidate` kinds

```ts
| { kind: "point"; id: "selected-point"; lat: number; lon: number; best_nap_id: string | null }
| { kind: "candidate"; id: string; rank: number; feasibility: "feasible" | "marginal" | "not_feasible" }
```

`projectHighlight` maps a `list_connection_candidates` result to one point entry and three
candidate entries. The feasibility of each entry is:

- `not_feasible` when the candidate is not feasible;
- `marginal` when it is feasible with a `marginal` projection;
- `feasible` otherwise.

The keys are `point:selected-point` and `candidate:<nap>`, apart from `nap:<id>`, so the existing
`put` merge leaves them alone. The newer entry replaces an equal key. Candidate entries carry no
`status`, so `worseStatus` never sees them: `put` compares statuses only when both entries have
one. `fit_bounds` is also true when a point entry exists.

*Alternative: reuse `nap` entries with budget statuses.* A full NAP painted `fail` would claim its
link fails, which is false. NAP-03 passes with 20.02 dB and is simply full. Feasibility is a
different question, so it gets a different kind.

### 8. The map

- **Selecting:** a general `map.on("click", …)` handler runs after the NAP layer's handler. It
  checks `queryRenderedFeatures` at the click for `naps-circle`, and returns if one is hit. Otherwise
  it calls `onSelectPoint({lat, lon})` when the click is inside the city bounds.
- **`Copilot`:**
  - holds `selectedPoint` and passes it to `ChatPanel`, which sends it as `map_context` with
    every request;
  - a "Clear point" button sits beside "Clear highlight";
  - selecting a new point clears the current payload when that payload has a point entry, as the
    spec requires.
- **Drawing:** two new GeoJSON sources:
  - `selected-point`, holding the user's marker, a hollow circle;
  - `feasibility`, holding the evaluated point and the drop line to the best NAP. The line goes
    from `point.lat/lon` to that NAP's position, both named by the payload: the resolver looks up
    a position and never chooses a NAP.
- **Candidate styles:** they use a NAP ring (`circle-stroke-*` via feature-state) rather than the
  fill, so a NAP keeps its fill and a nap-entry style can win the fill without conflict. Feasible
  is a teal ring and marginal a yellow ring. Not feasible is a dark grey ring, slightly thinner.
  Rings cannot be data-driven dashes.
  *Changed during task 4.3:* the first not-feasible ring was gray-500 at 2 px and 0.6 opacity,
  and in the browser it vanished against the neutral NAP fill. It is now zinc-700, 3 px, at 0.9
  opacity.
- **Rank labels.** The rank is drawn as its own label, `#1`, above the NAP.
  *Changed during task 4.3:* the plan was a `naps-label` variant driven by feature-state, but
  MapLibre cannot drive a layout property such as `text-field` from feature-state. The labels
  are features of the `feasibility` GeoJSON source, built from the resolved payload by
  `src/lib/map/feasibility-geojson.ts`.
- **Resolver:** `resolveHighlight` returns `candidateFeasibility`, `candidateRank`, `point` and
  `dropLine`, and drops entries for unknown NAPs. Bounds include the point and the candidates.

The colours go in `src/lib/map/config.ts`. They are checked in the browser against the budget
colours, as the cut colours were. The cut work showed that a style on paper can wash out on
screen.

### 9. Evals

- `EvalCase` gains `map_context?: { selected_point: { lat; lon } }`. The loader checks the point
  with `isInsideCity`.
- The runner passes it to `runAssistantLoop` on every turn. `CaseRecord` gains `map_context`, and
  regrade passes it to `dispatchTool`. A record without it re-grades with `{}`, so older records
  are unaffected.
- `highlightIds` adds candidate entry ids and skips the point. The case validator accepts those ids
  as NAP ids.
- `AREAS` gains `feasibility`, with eight cases written by hand:

| Case | Point | Turn(s) | Expectations |
|---|---|---|---|
| `feas-full-es` | A | "¿puedo conectar un cliente acá?" | tool called; highlight = {NAP-03, NAP-08, NAP-12}; grounding |
| `feas-budget-fail-es` | B | "¿se puede conectar un cliente en este punto?" | highlight = {NAP-09, NAP-04, NAP-05}; grounding; figures −2.25 |
| `feas-ok-en` | C | "can I connect a new customer here?" | highlight = {NAP-01, NAP-11, NAP-05}; grounding; figures 14.81 |
| `feas-marginal-es` | D | "¿puedo dar de alta un cliente acá?" | highlight = {NAP-06, NAP-02, NAP-08}; grounding; figures 2.51 |
| `feas-two-options-es` | E | "¿puedo conectar un cliente acá?" | highlight = {NAP-11, NAP-05, NAP-04}; grounding |
| `feas-second-option-es` | E | same, then "¿y si lo conecto a la segunda opción?" | grounding; figures 13.83, 593 |
| `feas-out-of-coverage-es` | F | "¿llega la red hasta acá?" | highlight = {NAP-10, NAP-07, NAP-01}; grounding |
| `feas-no-point-es` | — | "¿puedo conectar un cliente acá?" | tool called; abstention (no figure, empty highlight) |

A unit test checks every figure and oracle id against `seed/expected-feasibility.json`. The
"typed coordinates" behaviour is in the spec but has no eval case. Its grounding would pass
trivially, because the user supplied the numbers, so it is checked once by hand in the live run.

### 10. The oracle comes from an independent script

`seed/derive-expected-feasibility.py` sits beside `derive-expected-traces.py`. It produces
`seed/expected-feasibility.json` for points A–F plus the 28 subscriber positions. It uses its own haversine, port count, budget lookup from
`expected-budgets.json` and rounding, and imports nothing from `src/`. It is the same approach as
`expected-traces.json`, because 3 × 34 distance computations are not hand work. The engine test
compares field by field. The script's numbers were the planning values above.

### 11. One live run, against the run of record

1. A smoke run of `feas-*` under a $0.50 cap.
2. A full run (~42 cases) under a $2.50 cap.
3. `eval:compare` against `add-cut-impact`'s run of record (prompt hash `30844d48a2b6`). Read every
   flip by hand. A stable case that regresses through the new tool or its prompt paragraph is fixed
   before archiving. A flip on arithmetic in prose is the known weakness, read with the three-case
   noise in mind.
4. Check in the app: clicks, marker, candidates, drop line, clearing, and the typed-coordinates
   behaviour.

## Risks / Trade-offs

- **[The model calls the tool when no feasibility was asked]** → It has no arguments and is cheap,
  but a stray call would paint candidates. The description scopes it to "can a customer be
  connected at the selected point". The trajectory of the other areas' cases shows it if it
  happens.
- **[The model converts or sums distances]** ("a 0,6 km del máximo") → Grounding catches it. The
  result gives metres and km, and the maximum is in the result.
- **[A point exactly between two NAPs]** → Ties break by id, and the oracle avoids exact ties. Point
  E sits 11 m off the midpoint, 22 m closer to NAP-11 than to NAP-05.
- **[Candidates 6 km away stretch the reframe]** → Reframing on point D spans most of the city.
  This is accepted: the spread is the explanation. Revisit if it reads badly in the browser.
- **[600 m is not validated]** → It is marked pending validation in the constant, the snapshot and
  the README, like every drop constant. The proposal records it as an owner decision.
- **[A new tool shifts old cases]** → Decision 11's comparison is for that. The cached prefix grows
  by roughly 350 tokens.
- **[`CITY_BOUNDS` moves out of `validate.ts`]** → The import site changes and the values do not.
  The loader's tests cover it.

## Migration Plan

1. Shared drop, ports and constant, with the trace oracle passing unchanged.
2. Engine and oracle, under unit tests.
3. Map context through the route, the loop and the dispatcher, and the tool, prompt and payload.
4. Map selection, styles and resolver, checked in the browser with recorded turns.
5. Eval support, cases and the live runs.

There is no data migration. The request field is optional, so an old client keeps working, and
rollback is a revert.

## Open Questions

None blocking. The exact ring colours are settled in the browser (decision 8).
