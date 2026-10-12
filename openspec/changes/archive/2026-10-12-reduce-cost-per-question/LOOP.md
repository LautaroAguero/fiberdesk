# Implementation loop — reduce-cost-per-question, groups 3 and 4

Handoff for the agent that implements groups 3 and 4 of this change. Written so a fresh session,
with no memory of the planning conversation, can run them end to end. The plan is fixed: do not
redesign, implement.

Groups 1 and 2 are done (the noise-floor run and prompt caching). Groups 5 and 6 are live runs and
shipping, done by hand in the main session. **Your scope is tasks 3.1, 3.2, 3.3, 4.1 and 4.2
only.**

## Read first (in this order)

1. `CLAUDE.md` — the project rules. The one that matters most here: **the model reasons, the code
   calculates.** Every figure in a summary or a verdict comes from deterministic code.
2. `openspec/changes/reduce-cost-per-question/proposal.md` — scope and **non-goals**.
3. `openspec/changes/reduce-cost-per-question/specs/assistant-evals/spec.md` — the contract.
   **Scenario numbers are test values**; each scenario becomes one test.
4. `openspec/changes/reduce-cost-per-question/design.md` — decisions 3 (cold cost), 4 (the rule),
   5 (`decide` is pure; the CLI re-grades) and 6 (McNemar) are the ones you implement.
5. `openspec/changes/reduce-cost-per-question/tasks.md` — the work queue, groups 3 and 4.
6. `evals/decision-log.md` — the B1/B2 comparison. Useful to see real stable/unstable sets.

Code you will touch or read: `src/lib/evals/types.ts` (`RunRecord`, `TurnRecord`, `CaseRecord`,
`RunSummary`), `src/lib/evals/stats.ts` (`summarizeRun`, `median`, `p95`), `src/lib/evals/compare.ts`
(`compareRuns`, `RunComparison`), `src/lib/evals/report.ts` (`formatSummary`, `formatComparison`),
`src/lib/evals/runner.ts` (writes the record; `EvalConfig.promptCaching` already exists),
`src/lib/evals/regrade.ts` (`regradeRecord`), `src/lib/assistant/usage.ts` (`ModelCallRecord`),
`src/lib/assistant/pricing.ts` (`MODEL_PRICES`), `evals/compare.ts` and `evals/regrade.ts` (CLI
shape to copy for `evals/decide.ts`), `evals/README.md`, `package.json` (scripts).

## Facts that are easy to get wrong

- **"Per question" is per user turn**, not per case. B1 has 21 cases and 24 questions (the `conv-*`
  cases have two turns). `cost_per_question.n` is 24.
- `ModelCallRecord.model` is the model that **served** the call. Cold cost prices the first call's
  cache reads with that model's `cache_write_5m − cache_read`, from `MODEL_PRICES`.
- Cold cost re-prices **only the first call of each question**. Reads on later calls of the same
  question stay at the read rate (spec scenario "Reads after the first call are kept").
- A question whose cold cost cannot be priced (unpriced serving model on any call) is `null`,
  never estimated. Follow how the measured `cost_per_question` already treats `null` costs.
- B1 had no caching, so its cold median equals its measured median: **$0.037605**. Verify this by
  loading `evals/runs/2026-10-08T03-32-06Z.regraded.json` in a test and summarizing its cases.
- `prompt_caching` stays **out of `promptHash`**. The hash covers what the model reads; caching is
  billing (design.md, decision 2). Old records have no field and read as `false` through **one**
  helper that every reader uses.
- McNemar: `p = min(1, 2 · P(X ≤ min(b, c)))`, `X ~ Binomial(b + c, 0.5)`; `p = 1` when
  `b + c = 0`. Check values: (5, 1) → 0.21875; (10, 2) → 0.0386 to four decimals; (3, 3) → 1.
- The decision rule, exactly as the spec states it:
  - **Stable case**: passes in both baselines. **Stable grader on a case**: passes there in both.
  - **Veto**: a stable grounding or abstention grader fails in the candidate.
  - **Net loss**: reject when candidate passes < min(B1 passes, B2 passes) − 1.
  - **Concentrated loss**: reject when ≥ 2 stable cases of the same area fail in the candidate.
  - **Cost**: reject when the candidate's cold median > 50% of **B1's** cold median (not B2's).
  - **Inert caching**: reject when the candidate says `prompt_caching: true` and every call has
    zero cache reads.
  - `toRead`: every case whose outcome in the candidate differs from **either** baseline.
  - `no_verdict` (naming why): any record `partial` or `incomplete`, or with errored cases; or the
    two baselines differ in model, effort or prompt hash.
  - All checks pass → `accept_provisional`, never a plain accept.
  - McNemar against B1 is reported beside the verdict and **never decides it**.
- `decide` recomputes summaries from case data with `summarizeRun`; it does not trust a stored
  `summary` (the baseline records predate the cold-cost field).
- The CLI `evals/decide.ts` re-grades all three records in memory with `regradeRecord` before
  deciding, writes nothing, and needs no API key. A case that refuses to re-grade → `no_verdict`.
- Vitest runs in `node` and only picks up `src/**/*.test.ts`. Tests use `createFakeModelClient`,
  synthetic records, the seed and the corpus.

## Hard rules

- **Never call the Anthropic API.** Not in tests, not via `npm run eval`. Do not start groups 5
  or 6.
- Stay on branch `reduce-cost-per-question`. **Never push, never merge, never touch `main`.**
- **Do not change the decision rule.** If the spec looks wrong, stop and report; do not adjust it.
- Do not edit the loop, the route, the system prompt, the tools, `pricing.ts`, `config.ts`, the
  run records under `evals/runs/`, `openspec/specs/` (main specs) or the change's planning
  artifacts other than ticking boxes in `tasks.md`.
- Code, comments and commit messages in English. Match the surrounding style: files open with a doc
  comment explaining *why*, pointing to design.md decisions as `design.md
  (reduce-cost-per-question), decision N`.

## The loop

Repeat until no unchecked task remains in groups 3 and 4:

1. Open `tasks.md` and take the **first** unchecked task (`- [ ]`) in group 3 or 4.
2. Implement exactly that task, with every test it lists.
3. Run `npm test`, `npm run lint`, `npx tsc --noEmit`. Fix until all three pass, with no lint
   warnings.
4. Do the task's own "Verify" steps, if it has any.
5. Tick it in `tasks.md` (`- [x]`) and commit code and `tasks.md` together. Use a message like
   `Add cold cost per question to the run summary (reduce-cost-per-question 3.2)`, ending with the
   line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
6. Next task.

**Stop and report instead of guessing** when: the same task fails its checks three attempts in a
row; a task seems to require something the hard rules forbid; or the spec and the code disagree in
a way the facts above do not settle. Leave the task unchecked and describe the blocker.

## Final report

When done or stopped, report:

- the tasks completed, with commit hashes;
- the tasks left, and why;
- the final test count;
- the full output of `npm run eval:decide -- <B1> <B2> <B1>` from task 4.2, where B1 is
  `evals/runs/2026-10-08T03-32-06Z.regraded.json` and B2 is
  `evals/runs/2026-10-12T11-08-31Z.regraded.json`;
- anything in the spec you found ambiguous, and how you resolved it.
