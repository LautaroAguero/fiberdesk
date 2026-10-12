## Why

**Phase 4, fifth item: the last of the three map-user capabilities** in
`docs/handoff/2026-10-07-map-user-capabilities.md`. Sales and field planning ask one question more
than any other: "can I connect a customer here?", about a point on the map. Answering it takes
three checks: is a NAP close enough for a drop, does it have a free port, and does the link still
close its budget once the drop is added. Each check is arithmetic the model must not do. The
point itself is a pair of coordinates the model must not copy.

The seed already holds the cases worth showing, with no edits:

- next to NAP-03, the nearest box is full: a 1:2 splitter feeding one subscriber and NAP-12;
- next to NAP-09, the box has five free ports, but no new subscriber there closes the budget;
- 420 m from NAP-06, the link is feasible but marginal;
- in a narrow band between NAP-05 and NAP-11, two NAPs are feasible at once.

This change also settles the finding `add-subscriber-trace` handed over. The seed's 28
subscribers sit 450–498 m of modelled drop from their NAPs, beyond the ~300 m the handoff
suggested. **Owner decision (2026-10-12): the maximum moves to 600 m of drop route length.** The
seed, the slack factor and every committed oracle stay as they are.

## What Changes

- **Feasibility, in deterministic code, never the model.** For a point, the engine takes the
  **three NAPs nearest to it** (owner decision, 2026-10-12). Each one is always returned with:
  - its straight-line and modelled route distance;
  - its free ports: outputs, less subscribers, less child NAPs fed (handoff owner decision 1);
  - the projected budget of a new subscriber at the point: the NAP's budget plus the drop, with the
    same drop model the subscriber trace uses;
  - a verdict, `feasible` or `not_feasible`. A `not_feasible` candidate carries every reason that
    applies: `too_far`, `no_free_ports` or `budget_fail`.

  Feasible candidates come first. The result names the best one, or none. It is unit-tested against
  an oracle produced by an independent script, like the trace oracle.
- **One drop model, shared.** The drop computation moves out of the trace into one function that
  the trace and feasibility both call. The trace's results do not change, and its oracle still
  passes byte for byte.
- **Two new constants:**
  - the maximum drop route length (600 m), in `src/lib/optical/constants.ts`, pending validation.
    It is an operational limit, so it sits beside the minimum margin rather than among the
    physical losses;
  - the number of candidates (3). It is a product choice, not physics, so it lives with the
    feasibility engine.
- **Map context in the request.** A click on empty map space sets a selected point, shown as a
  marker. A click on a NAP still opens its breakdown. The chat request gains
  `map_context: { selected_point?: { lat, lon } }`, validated in the route against the modelled
  city's bounds. The point reaches the tool through the request, never through the model.
- **A new tool, `list_connection_candidates`.** It is the seventh tool, and it takes **no
  coordinates**. It evaluates the selected point. With no point selected, it returns an error
  telling the model to ask the user to click the map. The result echoes the point it evaluated, so
  any coordinate the model states is grounded in a tool result.
- **The payload gains two entry kinds.** `point` is the evaluated point. `candidate` is one NAP
  with its rank and its feasibility. Both are projected in code from the tool result, never emitted
  by the model. The map draws the point, colours the three candidates, and draws a drop line to the
  best feasible one. Picking a new point clears a feasibility highlight that belongs to the old one.
- **The eval suite gains map context.** A case can declare a selected point, sent with every turn.
  The highlight grader compares candidate entries.
- **Eval cases** in a new `feasibility` area: the full nearest NAP (NAP-03), the failing one
  (NAP-09), a comfortable case, a feasible-but-marginal case (NAP-06), two feasible NAPs, a point
  out of coverage, no point selected, and the follow-up "¿y si lo conecto a la segunda opción?".
  One full live run is recorded and read case by case.

## Capabilities

### New Capabilities

- `connection-feasibility`: for a point, evaluates the three nearest NAPs against drop distance,
  free ports and projected budget. Each verdict is deterministic, and every failing check is named.

### Modified Capabilities

- `optical-budget`: the drop requirement gains the shared drop model and the maximum drop route
  length, still pending validation.
- `network-assistant`:
  - adds the connection-candidates tool and the map context it reads, including the refusal when
    no point is selected;
  - the map payload requirement gains the `point` and `candidate` kinds;
  - the constants tool exposes the maximum drop route length.
- `network-map`: a click on empty space selects a point; the highlight requirement gains the point,
  the candidate colours and the drop line; the reframe requirement covers a feasibility answer.
- `assistant-evals`: cases can carry map context, and the highlight grader compares candidates.

## Non-goals

- **Assigning a port or writing the subscriber to the network.** Feasibility is a hypothetical
  query. Write actions stay out of scope for the handoff.
- **Address geocoding.** The point comes from a click, never from a street name.
- **Drop routing along streets.** The drop stays a straight line times the slack factor.
- **New NAPs, splitter upgrades or what-if planning** ("what if NAP-03 were a 1:4?").
- **More than three candidates, or a radius the user chooses.**
- **Receiver sensitivity.** As in the trace, nothing here claims the ONT will work.
- **Moving the seed or the slack factor.** Owner decision: only the maximum moves.
- **Prompt work** on arithmetic in prose. The system prompt changes only as far as the new tool
  needs it.

## Impact

- **Code:**
  - `src/lib/optical/`: the shared drop function, the trace calling it, and the two constants.
  - `src/lib/topology/`: free ports per NAP.
  - `src/lib/feasibility/` (new): the engine and its result type.
  - `src/lib/assistant/`: the tool definition, the dispatcher reading a request context, the loop
    passing it through, the payload kinds and projection, the constants snapshot and a prompt
    paragraph.
  - `src/app/api/chat/route.ts`: `map_context` parsed and validated.
  - `src/components/` and `src/lib/map/`: point selection, the marker, candidate styles and the
    drop line.
  - `src/lib/evals/`: map context on cases, the runner, the grader and the `feasibility` area.
- **Seed:** a new oracle, `seed/expected-feasibility.json`, for a fixed set of points, generated
  by an independent Python script. `seed/network.json` is unchanged.
- **Contract:**
  - The chat request body gains an optional field, so an old client still works.
  - `HighlightPayload` gains two kinds. That is an extension, not a reshaping: existing entries keep
    their shape, and recorded runs still re-grade.
- **Model and cost:** the model is unchanged (`claude-opus-5`, effort `low`, prompt caching on).
  The map context never enters the prompt, so the cached prefix grows only by the new tool. A new
  prompt hash means a new full eval run, about $0.85 for ~42 cases.
- **No new dependencies.**
