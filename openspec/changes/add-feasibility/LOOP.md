# Implementation loop — add-feasibility, groups 1 to 5

Handoff for the agent that implements groups 1–5 of this change. Written so a fresh session, with
no memory of the planning conversation, can run them end to end. The plan is fixed: do not
redesign, implement.

Tasks 1.4, 3.1 and 3.2 are already done (commit `8cf1a7d`): `isInsideCity`, `MapContext` /
`parseMapContext` in `src/lib/assistant/map-context.ts`, and the context threaded through the route,
`runAssistantLoop({ mapContext })`, `runToolUse` and `dispatchTool(…, mapContext = {})`. Group 6
(live API runs and the check in the app) and group 7 (docs) are done by hand in the main session.

**Your scope is every other unchecked task in groups 1–5**, in file order: 1.1, 1.2, 1.3, 2.1,
2.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3. Task 4.3 is a special case: implement its code,
run the checks, commit, but **leave its checkbox unticked**, because its browser verification is
done in the main session.

## Read first (in this order)

1. `CLAUDE.md`: the project rules. The one that matters most: **the model reasons, the code
   calculates.** Every distance, port count, margin and verdict comes from code.
2. `openspec/changes/add-feasibility/proposal.md`: scope and **non-goals**.
3. The delta specs in `openspec/changes/add-feasibility/specs/`: `connection-feasibility` (new),
   `optical-budget`, `network-assistant`, `network-map` and `assistant-evals`. **Scenario values
   are test values.**
4. `openspec/changes/add-feasibility/design.md`: decisions 1–11 are settled. The Context table
   (points A–F) and decisions 1, 3, 7, 8 and 9 are the ones you will reread most.
5. `openspec/changes/add-feasibility/tasks.md`: the work queue.

Code you will touch or read:
- `src/lib/optical/`: `trace.ts` (the drop to extract), `budget.ts` (`calculateBudget`, `round2`,
  `BudgetResult`), `constants.ts`, `status.ts`.
- `src/lib/topology/cut.ts` (the newest engine module: follow its style).
- `src/lib/geo/distance.ts` (`haversineKm`), `src/lib/network/validate.ts` (`isInsideCity`).
- `src/lib/assistant/`: `map-context.ts`, `dispatcher.ts`, `tool-definitions.ts`
  (`CUT_IMPACT_TOOL_NAME` is the model to follow), `events.ts`, `highlight.ts`,
  `optical-constants.ts`, `system-prompt.ts`.
- `src/lib/map/highlight.ts`, `src/lib/map/config.ts`, `src/components/NetworkMap.tsx`,
  `Copilot.tsx`, `ChatPanel.tsx`.
- `src/lib/evals/`: `types.ts`, `cases.ts`, `runner.ts`, `regrade.ts`, `graders/highlight.ts`.
- `seed/derive-expected-traces.py` (the model for the new oracle script), `evals/cases/cut.json`.

## Facts that are easy to get wrong

- **Rounding.** The engine rounds with `Math.round(x * 100) / 100` (halves up). The Python oracle
  script must not use `round()` (banker's); copy the helpers from `derive-expected-traces.py`.
  Distances in metres are `Math.round(km * 1000)`. **`too_far` compares the reported, rounded
  `route_m` with `MAX_DROP_ROUTE_M` (600)**, strictly greater.
- **The drop must not change.** After 1.1 `trace.test.ts` and `seed/expected-traces.json` pass
  with **no edit**. `projectLink` computes `total = round2(nap.total_loss_db + drop.loss_db)`,
  `margin = round2(budget_db - total)`, status `fail` < 0 ≤ `marginal` < min margin ≤ `pass`, and
  `by_source` exactly as `traceSubscriber` does today.
- **Free ports** = outputs (the right-hand side of the ratio, `"1:16"` → 16) − subscribers served −
  child NAPs fed. Seed values: NAP-03 0, NAP-10 2, NAP-01/04/09 5, NAP-05/07 6, NAP-12 12,
  NAP-02/08/11 14, NAP-06 29. Negative → throw naming the NAP.
- **Candidates.** Sort all NAPs by unrounded straight-line distance, ties by id, take 3. Evaluate
  all three, always (budget projected even when too far or full). Reasons in fixed order
  `too_far`, `no_free_ports`, `budget_fail`. Then sort feasible first, each group by distance, and
  assign `rank` from 1. `best_nap_id` is the rank-1 candidate if feasible, else `null`.
  `feasible_count` is computed in code. The point is echoed exactly as given.
- **Expected values** (from the planning script; your oracle script must reproduce them):
  - A (-27.4165, -59.0180): NAP-03 route 217 `[no_free_ports]` margin 19.17; NAP-08 3253 and NAP-12
    3549 `[too_far]`; no best.
  - B (-27.4955, -58.9380): NAP-09 route 217, 5 free, total 30.25, margin −2.25 `fail`
    `[budget_fail]`.
  - C (-27.4432, -58.9770): NAP-01 route 205, margin 14.81 `pass`, feasible, best.
  - D (-27.4930, -59.0338): NAP-06 route 539, drop 0.93, total 25.49, margin 2.51 `marginal`,
    feasible (its own NAP status stays `pass` 3.44).
  - E (-27.4659, -58.9700): NAP-11 route 564 margin 11.39 rank 1; NAP-05 route 593 margin 13.83
    rank 2; NAP-04 `[too_far]` rank 3; best NAP-11; count 2.
  - F (-27.4300, -58.9400): NAP-10, NAP-07, NAP-01 all `[too_far]`.
  - SUB-025's position: NAP-12 projects 26.15 / 1.85 `marginal`, the drop identical to the trace.
  If the engine and the oracle disagree, **stop and report**; do not edit either to match.
- **The tool** `list_connection_candidates` takes no arguments (`strict: true`,
  `properties: {}`, `required: []`, `additionalProperties: false`). With no
  `mapContext.selected_point` it returns an `is_error` result whose message starts
  `No point is selected on the map.` (design.md, decision 5). Remove the temporary
  `eslint-disable` on `mapContext` in `dispatcher.ts` once the tool reads it.
- **The payload** keeps every existing variant unchanged and adds:
  `{ kind: "point"; id: "selected-point"; lat; lon; best_nap_id: string | null }` and
  `{ kind: "candidate"; id: <NAP id>; rank; feasibility: "feasible" | "marginal" | "not_feasible" }`.
  They carry **no `status`**: make `put` compare statuses only when both entries have one. A
  feasibility call contributes **no `nap` entry**. `fit_bounds` is true with a point entry too.
  An errored call contributes nothing.
- **The map.** A NAP's own entry wins its fill; candidates use a ring (`circle-stroke-*` by
  feature-state) and a rank label. The drop line goes from the payload's point to the NAP named
  by `best_nap_id`; the resolver never picks a NAP. `Copilot.hasHighlight` must count candidate
  and point entries, so "Clear highlight" appears for them. Add a `toolActivityLabel` for the new
  tool in `ChatPanel.tsx` ("Evaluating the selected point").
- **Evals.** `highlightIds` adds candidate ids and skips the point. `CaseRecord` gains
  `map_context`; regrade passes it to `dispatchTool`, `{}` when absent. The run of record for the
  5.1 check is `evals/runs/2026-10-12T17-12-15Z.json` (34 cases, prompt hash `30844d48a2b6`).
- **The prompt hash** before this change is `30844d48a2b6`. It must change in 3.3/3.5, which is
  expected.
- **Line endings.** The repo is LF. If you edit with a script on Windows, write bytes, not text
  mode, or you will turn files into CRLF. Prefer the Edit and Write tools. Bash heredocs with
  apostrophes have failed to parse on this setup.
- Vitest runs in `node` and only picks up `src/**/*.test.ts`. Do not add jsdom or component tests.

## Hard rules

- **Never call the Anthropic API.** Do not run `npm run eval`. `npm run eval:regrade` and
  `eval:compare` are offline and allowed. Do not start groups 6 or 7.
- Stay on branch `add-feasibility`. **Never push, never merge, never touch `main`.**
- Do not edit `openspec/specs/`, the change's planning artifacts (except ticking boxes in
  `tasks.md`), `seed/network.json`, `seed/expected-traces.json`, `seed/expected-budgets.json` or
  the run records in `evals/runs/`. Restore any `.regraded.json` a re-grade overwrites.
- Do not change any existing optical constant, the NAP, trace or cut engines' results, the eval
  decision rule, `config.ts` in `src/lib/assistant` or `pricing.ts`.
- Code, comments and commit messages in English. Match the surrounding style: files open with a doc
  comment explaining *why*, pointing to `design.md (add-feasibility), decision N`.

## The loop

Repeat until every task in your scope is done:

1. Take the **first** unchecked task in your scope.
2. Implement exactly that task, with every test it lists.
3. Run `npm test`, `npm run lint` (no warnings) and `npx tsc --noEmit`. Fix until all three pass.
4. Do the task's own "Verify" steps. For 4.3, do everything except the browser check.
5. Tick it (not 4.3), and commit the code and `tasks.md` together, with a message like
   `Add the feasibility engine (add-feasibility 2.2)` ending with the line
   `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
6. Next task.

**Stop and report instead of guessing** when:
- the same task fails its checks three attempts in a row;
- the engine and the oracle disagree, or either disagrees with the expected values above;
- a task seems to need something the hard rules forbid;
- the spec and the code disagree in a way the facts above do not settle.

Leave that task unchecked and describe the blocker.

## Final report

When done or stopped, report:
- the tasks completed, with commit hashes;
- what is left of 4.3 (the browser check) and any other task left, and why;
- the final test count;
- the new prompt hash (12 characters);
- the result of the 5.1 re-grade check (outcomes case for case);
- anything you found ambiguous, and how you resolved it.
