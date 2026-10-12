# Implementation loop — add-subscriber-trace, groups 1 to 4

Handoff for the agent that implements groups 1–4 of this change. Written so a fresh session, with
no memory of the planning conversation, can run them end to end. The plan is fixed: do not
redesign, implement.

Group 5 (live API runs and the check in the app) and group 6 (docs) are done by hand in the main
session. **Your scope is tasks 1.1 to 4.1.** Task 2.3 is a special case: implement its code, run
the checks, commit, but **leave its checkbox unticked**. Its browser verification is done in the
main session.

## Read first (in this order)

1. `CLAUDE.md`: the project rules. The one that matters most: **the model reasons, the code
   calculates.** No figure may come from anywhere but deterministic code.
2. `openspec/changes/add-subscriber-trace/proposal.md`: scope and **non-goals**.
3. The delta specs in `openspec/changes/add-subscriber-trace/specs/`: `optical-budget`,
   `network-assistant`, `network-map` and `assistant-evals`. **Scenario numbers are test values.**
4. `openspec/changes/add-subscriber-trace/design.md`: decisions 1–11 are settled. Decision 2's
   rounding table and decision 7's payload type are the ones you will reread most.
5. `openspec/changes/add-subscriber-trace/tasks.md`: the work queue.

Code you will touch or read:
- `src/lib/optical/`: `budget.ts` (`calculateBudget`, `BudgetResult`, `round2`), `constants.ts`,
  `constants.test.ts`, `fixture.test.ts`.
- `src/lib/network/types.ts` (`Subscriber`, `Position`).
- `src/lib/assistant/`: `events.ts`, `highlight.ts` (`projectHighlight`), `tool-definitions.ts`,
  `dispatcher.ts`, `optical-constants.ts` and `system-prompt.ts`.
- `src/lib/map/highlight.ts` (`resolveHighlight`), `src/components/Copilot.tsx`,
  `src/components/NetworkMap.tsx`.
- `src/lib/evals/`: `graders/highlight.ts` (`highlightIds`), `graders/abstention.ts`, `cases.ts`
  (validation), `types.ts` (`AREAS`, `ToolRequirement`), `regrade.ts` and `runner.ts`.
- `evals/cases/*.json`, `seed/network.json`, `seed/expected-budgets.json`.

## Facts that are easy to get wrong

- **Rounding.** The engine's `round2` is `Math.round(value * 100) / 100`. In the Python oracle
  script, **do not use `round()`**: it is banker's rounding. Use
  `math.floor(x * 100 + 0.5) / 100`, and the same with 1000 for km. Follow design.md decision 2
  exactly: link figures are computed from the *reported* (already rounded) figures, not from raw
  floats.
- **Distance.** Haversine on R = 6371.0088 km. SUB-026's straight line is 0.3525013 km, right at
  a rounding boundary. If the TypeScript and Python results ever disagree on a field there, stop
  and report: do not adjust either one to match.
- **Planning figures to check the oracle against:**
  - SUB-025: 0.383 / 0.498 km, drop 0.12 + 0.80 = 0.92 dB, total 26.15, margin 1.85, marginal,
    −23.15 dBm;
  - SUB-014: 16.60 / 11.40 / pass;
  - SUB-018: 30.32 / −2.32 / fail;
  - SUB-011: 25.48 / 2.52 / marginal, with NAP-06 pass at 3.44;
  - SUB-026: 0.458 km, 0.91 dB, 26.14 / 1.86.

  Exactly SUB-011, SUB-012 and SUB-013 differ from their NAP's status.
- **The payload union** uses `id` in every entry. Only a subscriber entry carries `nap_id`. A
  trace adds **no** NAP entry. Runs merge by id and keep the worse status (`fail` > `marginal` >
  `pass`). `fit_bounds` is true only if a NAP or subscriber entry exists.
- **`highlightIds`** returns NAP and subscriber ids only. The abstention grader uses it too, so a
  declined question that only produced run entries would still count as "nothing highlighted".
  That is fine, because no tool produces runs alone.
- **Re-grading old records** re-projects from stored tool results. Stored `highlight_ids` are NAP
  ids and must still match.
- **Eval case shape:** see `evals/cases/budget.json` and `abstention.json`. A pinned trajectory
  requirement is `{"tool": "trace_subscriber_link", "input": {"subscriber_id": "SUB-025"}}`.
  Highlight is `{"mode": "equals" | "contains", "ids": [...]}`. Figures are numbers, negatives
  included (`-2.32`).
- `src/lib/network/load.ts` uses `node:fs`: never import it from a `"use client"` file.
- Vitest runs in `node` and only picks up `src/**/*.test.ts`. Do not add jsdom or component tests.
- Changing the system prompt and the toolset changes `promptHash`. That is expected (task 3.4).

## Hard rules

- **Never call the Anthropic API.** Do not run `npm run eval`. `npm run eval:regrade` and
  `eval:compare` are offline and allowed. Do not start groups 5 or 6.
- Stay on branch `add-subscriber-trace`. **Never push, never merge, never touch `main`.**
- Do not edit `openspec/specs/` or the change's planning artifacts, except ticking boxes in
  `tasks.md`. Do not edit the run records in `evals/runs/`.
- Do not change the optical constants that already exist, the NAP engine's behaviour, the eval
  decision rule, `config.ts` or `pricing.ts`.
- Code, comments and commit messages in English. Match the surrounding style: files open with a doc
  comment explaining *why*, pointing to `design.md (add-subscriber-trace), decision N`.

## The loop

Repeat until every task in groups 1–4 is done:

1. Open `tasks.md` and take the **first** unchecked task in groups 1–4.
2. Implement exactly that task, with every test it lists.
3. Run `npm test`, `npm run lint` (no warnings) and `npx tsc --noEmit`. Fix until all three pass.
4. Do the task's own "Verify" steps. For 2.3, do everything except the browser check.
5. Tick it in `tasks.md` (not 2.3), and commit the code and `tasks.md` together, with a message
   like `Add the subscriber link budget engine (add-subscriber-trace 1.5)` ending with the line
   `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
6. Next task.

**Stop and report instead of guessing** when:
- the same task fails its checks three attempts in a row;
- a task seems to need something the hard rules forbid;
- the oracle and the engine disagree;
- the spec and the code disagree in a way the facts above do not settle.

Leave that task unchecked and describe the blocker.

## Final report

When done or stopped, report:
- the tasks completed, with commit hashes;
- what is left of 2.3 (the browser check) and any other task left, and why;
- the final test count;
- the new prompt hash (first 12 characters);
- the compare output of the 2.4 re-grade check;
- anything you found ambiguous, and how you resolved it.
