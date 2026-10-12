## Why

**Phase 4, fourth item: the second of the three map-user capabilities** in
`docs/handoff/2026-10-07-map-user-capabilities.md`. Today the assistant can explain a link's
budget, but it cannot answer the first question an operator asks when a cable is damaged: what
goes down? "If FR-03 is cut, which customers lose service?" needs a walk down the tree, through
cascades, and a count. A model that counts a list itself is exactly the arithmetic this project
forbids.

The tree already holds the case worth showing. Cutting FR-03 takes out NAP-03 and, through the
cascade, NAP-12: 5 subscribers in all, while NAP-03 alone serves only one of them. The same cut
reaches four times further than the box at its end suggests.

This change reuses the payload by entity kind that `add-subscriber-trace` introduced. The
affected subtree is a set of NAPs, runs and subscribers, painted in a status of its own.

## What Changes

- **Cut impact, in deterministic code, never the model.** Given a fiber run or a NAP, the engine
  walks the `parent` tree downstream and returns:
  - every NAP left without service, including through cascades;
  - every subscriber left without service;
  - every fiber run that goes dark downstream;
  - the counts of each.

  It is a pure traversal, unit-tested against a hand-derived oracle committed in `seed/`. Cutting
  a NAP's feeder run and losing the NAP itself leave the same elements without service. The two
  differ only in which element is reported as cut.
- **A new tool, `list_cut_impact`.** It is the sixth tool. Its `element_id` is a strict enum of the
  network's 12 fiber runs and 12 NAPs, so the OLT is excluded (owner decision 3). Its description
  tells the model to cite the counts it returns, never to count a list itself, and to say plainly
  that a cut at the OLT is not supported.
- **The payload gains two statuses.** `cut` marks the cut element, and `out_of_service` marks
  everything downstream of it. Both are projected in code from the tool result, never emitted by
  the model. An entry with one of these statuses carries no margin. When two entries name the same
  element, the more severe status wins: `cut`, then `out_of_service`, then `fail`, `marginal`,
  `pass`.
- **The map draws a cut.** The cut element and the affected subtree each take a style distinct
  from the budget colours. The view reframes to include them.
- **The highlight grader compares a cut run.** A run entry with status `cut` is the subject of the
  answer, not a path, so the grader compares it alongside NAPs and subscribers.
- **Eval cases** in a new `cut` area:
  - a feeder cut through a cascade (FR-03: 5 subscribers);
  - a leaf run cut (FR-12: 4);
  - a NAP down (NAP-04: 5);
  - an element that does not exist;
  - a cut at the OLT;
  - a follow-up "¿cuántos clientes son?", whose answer must come from the tool's count.

  One full live run is recorded and read case by case.

## Capabilities

### New Capabilities

- `cut-impact`: computes what a cut of one fiber run or one NAP takes out of service downstream,
  through cascades, with the counts. Deterministic, and an unknown element is refused.

### Modified Capabilities

- `network-assistant`:
  - adds the cut impact tool, including its refusal of the OLT and of unknown elements;
  - the map payload requirement gains the `cut` and `out_of_service` statuses and their precedence.
- `network-map`: the highlight requirement gains the cut and out-of-service styles, and the reframe
  requirement covers a cut.
- `assistant-evals`: the highlight grader compares runs whose status is `cut`.

## Non-goals

- **A cut at the OLT.** It is excluded by owner decision 3. The tool cannot be called with it, and
  the assistant says it is not supported.
- **Partial damage, attenuation from a bent fiber, repair times or restoration plans.** A cut here
  is total: the element and everything downstream lose service.
- **Redundant paths or rerouting.** The seed is a tree; there is no other way around a cut.
- **Several simultaneous cuts.** One element per call.
- **Upstream effects.** Nothing upstream of a cut changes. The feeder run of a NAP that goes down
  stays lit.
- **Writing to the network.** Marking an element as cut is a hypothetical query, never a state
  change. Write actions are out of scope for the handoff.
- **Prompt work** on arithmetic in prose. The system prompt changes only as far as the new tool
  needs it.

## Impact

- **Code:**
  - `src/lib/topology/` (new): the cut traversal and its result type.
  - `src/lib/assistant/`: tool definition, dispatcher, system prompt paragraph, payload statuses and
    projection.
  - `src/lib/optical/status.ts`: the severity order extended to the impact statuses.
  - `src/lib/map/highlight.ts` and `NetworkMap.tsx`: the impact styles.
  - `src/lib/evals/`: the grader, the case validator and the `cut` area.
- **Seed:** a hand-derived oracle, `seed/expected-cut-impacts.json`, for all 24 elements.
- **Contract:** `HighlightPayload` gains two status values and margin-less entries. That is an
  extension rather than a reshaping: existing entries keep their shape, and recorded runs still
  re-grade.
- **Model and cost:** the model is unchanged (`claude-opus-5`, effort `low`, prompt caching on). A
  new prompt hash means a new full eval run, about $0.70 for 34 cases.
- **No new dependencies.**
