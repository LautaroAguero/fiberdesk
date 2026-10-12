## Why

**Phase 4, third item: the first of the three map-user capabilities** in
`docs/handoff/2026-10-07-map-user-capabilities.md`. Today the assistant can explain a NAP's link
budget but stops at the box. Nobody can ask about the one thing a support call is about: a
specific customer. "Why is Subscriber 025's signal low?" has no answer, because the network's 28
subscribers are drawn on the map but no tool knows they exist.

This change goes first among the three because it is the smallest. It also introduces the two
pieces the other two reuse: the **drop model** (the last stretch of fiber from the NAP to the
customer's ONT) and a **generalized map payload** that can name more than NAPs.

The seed already holds an edge case for it. NAP-06 passes its budget with 3.44 dB of margin, but
the drop to each of its three subscribers costs about 0.92 dB, which leaves them **marginal** at
2.52 dB. A box that passes does not mean every customer on it does.

## What Changes

- **Subscriber link budget (deterministic code, never the model).** For one subscriber, the engine
  returns:
  - the serving NAP's full budget, unchanged and reused from the existing engine (no second path
    walk);
  - the drop from the NAP to the subscriber: straight-line distance × a slack factor, fiber loss
    over that length, and the connectors a drop adds;
  - the end-to-end total loss, its breakdown by source, the margin against the GPON class budget,
    the classification and the estimated power received at the ONT.

  All arithmetic runs in TypeScript and is unit-tested against a hand-derived oracle committed in
  `seed/`, like `seed/expected-budgets.json`.
- **Drop constants.** The slack factor (1.3) and connectors per drop (2) go in the optical constants
  module, each with unit and source, marked **pending validation** like every other constant. The
  drop's fiber loss reuses the existing 0.25 dB/km. The README names them as assumptions, not data.
- **A new tool, `trace_subscriber_link`.** Its `subscriber_id` is a strict enum of the 28 subscribers
  in the network. It is the fifth tool, named for the shape of its answer: one subscriber's link,
  traced end to end.
- **BREAKING — the map payload names entities by kind.** An entry is a NAP, a subscriber or a fiber
  run, each with its classification, still projected in code from tool results and never emitted
  by the model. The detail tool now projects its NAP plus the runs on its path; the trace tool
  projects the subscriber plus every run on its path. This changes the contract read by the map and
  by the eval highlight grader.
- **The map draws a traced subscriber.** The subscriber's point and its path back to the OLT take
  its classification colour, and the view reframes to include the subscriber.
- **Eval cases** for the new capability, in a new `trace` area:
  - a cascaded subscriber on NAP-12;
  - a direct one;
  - one on the failing NAP-09;
  - one on NAP-06, which passes as a NAP while its subscriber is marginal;
  - a subscriber id that does not exist;
  - a lookup by name ("el cliente Subscriber 014").

  The existing 21 cases keep passing against the new payload. One full live run is recorded and
  compared case by case against the noise floor of `reduce-cost-per-question`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `optical-budget`: adds the link budget from the OLT to a subscriber's ONT, the drop model, and
  the refusal of an unknown subscriber.
- `network-assistant`:
  - adds the subscriber trace tool;
  - **BREAKING:** the map payload requirement changes from NAP entries to typed entries per entity
    kind;
  - the assistant must not claim a subscriber's ONT "will work", because receiver sensitivity is not
    modelled.
- `network-map`: the highlight and reframe requirements extend to subscribers and to runs named by
  the payload.
- `assistant-evals`: the highlight grader compares the highlighted NAPs and subscribers, and
  ignores the run entries that only describe their paths.

## Non-goals

- **ONT receiver sensitivity.** It stays unmodelled; the corpus gap about it is deliberate. The
  trace classifies against the class budget only and reports the received power as an estimate.
- **Drop geometry on the map.** The seed has no drop polylines. The map highlights the subscriber
  and its path to the NAP, and draws no invented line for the drop.
- **Clicking a subscriber for its breakdown.** The breakdown card stays NAP-only. The trace's
  figures reach the user through the answer.
- **Listing subscribers by NAP, or by neighbourhood.** That is `add-cut-impact`'s territory.
- **A lookup tool for real-ISP scale.** The enum works for 28 subscribers. Thousands would need a
  search tool instead; `design.md` records the limit and nothing is built for it.
- **Maximum drop distance and feasibility.** Those belong to `add-feasibility`. Every seed subscriber
  sits 346–383 m in straight line from its NAP, above the ~300 m maximum the handoff suggests for
  feasibility. `design.md` flags this for that change, and this change neither uses nor sets a
  maximum.
- **Prompt work** on arithmetic in prose. That stays a separate change. The system prompt changes
  here only as far as the new tool needs it.

## Impact

- **Code:**
  - `src/lib/optical/`: drop constants; a subscriber trace function beside `calculateBudget`; a
    distance helper.
  - `src/lib/assistant/`: tool definition, dispatcher, and the highlight projection for the new
    payload.
  - `src/lib/map/highlight.ts`, `NetworkMap.tsx`, `Copilot.tsx`: the new payload and the subscriber
    layer state.
  - `src/lib/evals/`: the grader, case validation and the `trace` area.
- **Seed:** a new hand-derived oracle, `seed/expected-traces.json`, for all 28 subscribers.
- **Contract:** `HighlightPayload` breaks. The route's `done` event keeps its shape around it.
  Recorded run records stay re-gradable: the projection runs again from their stored tool results.
- **Model and cost:** the model is unchanged (`claude-opus-5`, effort `low`, prompt caching on). A
  fifth tool grows the cached prefix a little, and the new prompt hash means a new full eval run of
  about $1.2.
- **No new dependencies.**
