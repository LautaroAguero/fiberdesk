## Why

**Phase 4 — production, second item.** The owner's goal (handoff of 2026-10-07, change 0b) is a
median cost per question at or below **50% of the baseline**: $0.0376 → **$0.0188 or less**,
measured from run records, not estimated. It comes before the three map capabilities so that they
are built and evaluated on the model they will ship with.

The baseline record (`evals/runs/2026-10-08T03-32-06Z.regraded.json`) shows where the money goes:
48 model calls, 156,031 input tokens against 9,837 output, so **input is 76% of the cost** — and
**not one token was read from the prompt cache**. Every call resends the same ~2,440-token prefix
(four tool definitions and the system prompt) at full price, two or three times per question.

Two things the handoff assumed no longer hold, and this change has to deal with both:

- **The eval has 21 cases, not ~80.** The handoff's decision rule (exact McNemar, "loses at most 5
  points", 3 new failures per area) was sized for 80. At n = 21, one case is 4.8 points and no
  difference under 6 discordant cases can be significant. The rule is restated for 21 cases, with
  the noise between two runs of the same configuration as its reference.
- **Caching only pays when the prefix is reused.** Re-pricing the baseline's own tokens: caching
  on `claude-opus-5` gives 55% of baseline when the prefix is still warm from another question
  (as in an eval that runs cases back to back) and 92% when each question arrives alone. The demo's
  real traffic is the second kind. **Owner decision, 2026-10-09: the target is judged on the cold
  figure**, so a number in the README does not depend on traffic the app does not have.

## What Changes

- **The noise floor first.** Before any code changes, the baseline configuration is run a second
  time, on the same prompt hash. Comparing the two runs gives the cases that flip by chance
  (unstable) and the cases that pass in both (stable). Every later judgment builds on those two sets.
- **Prompt caching in the assistant loop.** One breakpoint at the end of the system prompt (tools and
  system render first, so it covers both) plus automatic caching for the growing conversation
  tail. Same bytes to the model; only the billing changes. A run with caching on and zero cache reads
  is a bug to find, not a result.
- **Cold cost per question in the run summary.** Computed in code from the recorded usage: each
  question's first call has its cache reads re-priced as cache writes, as if no earlier question
  had warmed the prefix. Measured (warm) and cold figures are both reported; the target is judged
  on cold. Deterministic code, never the model.
- **A decision rule for 21 cases, applied in code.** `npm run eval:decide` takes the two baseline
  records and a candidate record and returns accept or reject with its reasons: a veto on any
  stable case whose grounding or abstention grader regresses; a cap on net loss and on new failures
  per area; the cold-cost target; and the list of discordant cases a person must read before the
  verdict stands. It reports the exact McNemar test for context, not as the gate. Fixed now,
  before any candidate runs.
- **Candidates in order, stopping at the first that passes** (owner decision, 2026-10-09):
  caching is kept in every candidate; then `claude-sonnet-5-5` at effort `low`, then `medium`.
  `claude-opus-5-5` is not run: even at baseline token counts its cold cost re-prices to 71% of
  baseline, so it cannot pass the cost check, and the migration notes say it thinks more per effort
  level, not less (design.md, decision 7). The winner gets a second, confirming run that must pass
  the same rule.
- **Caching ships whatever the verdict.** It changes no byte the model reads, so it needs no
  quality gate. The model changes only on an accepted, confirmed verdict.
- **Ship the winner.** `src/lib/assistant/config.ts` changes to the winning model and effort; the
  route and the eval move together, as they were built to. One live question in the app confirms
  the route still works on the new model.
- **README table**: every configuration that ran, with median and p95 cost (cold and measured),
  p95 latency, pass rate with *n* and interval, McNemar against the baseline, and the verdict —
  losers included, as the evidence for the choice. If nothing passes, the table and the reason
  are the deliverable (the handoff's definition of done allows it).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `assistant-evals`: the run summary gains the cold cost per question; the comparison of two runs
  gains the exact McNemar test; a new requirement fixes the decision rule for accepting a cheaper
  configuration (veto, net loss, per-area cap, cost target, hand reading of discordant cases); the
  run record states whether prompt caching was on.
- `network-assistant`: a new requirement that every model call marks the stable prefix (tool
  definitions and system prompt) as cacheable, without changing what the model sees or what the
  user receives.

## Non-goals

- **Making the failing cases pass.** The five baseline failures (arithmetic in prose, stopping at
  the survey) are prompt or product work. Changing the prompt here would mix a quality change into
  a cost comparison and void the paired runs.
- **Trimming the prompt or tool descriptions** to save input tokens. Same reason: it changes
  behaviour, so it is its own change with its own runs.
- **Haiku** (any version), the 1-hour cache TTL, cache pre-warming, the Batch API, fast mode.
- **Refusal fallbacks** (`fallbacks` on Opus 5.5 / Sonnet 5.5). A refusal stays the graded answer,
  as decided in add-eval-harness; a fallback would bill a second model inside the measured call.
- **Rendering progress-update `thinking` blocks** in the chat. On Opus 5.5 and Sonnet 5.5, notes
  between tool calls move from `text` to `thinking` blocks the page does not show. The final answer
  is unaffected; a quieter chat during tool calls is accepted and noted, not fixed here.
- **A non-inferiority claim.** At n = 21 this rule cannot prove the loss is under 5 points. The
  README says so.

## Impact

- **Code:** `src/lib/assistant/loop.ts` (cache markers on every request), `config.ts` (caching
  setting; later the winning model and effort), `pricing.ts` (cache-write rates confirmed, new
  verification date), `src/lib/evals/` (cold cost in `stats.ts`, McNemar in `compare.ts`, a new
  `decide.ts`, the record's caching field), `evals/decide.ts` and an `eval:decide` npm script.
- **Records:** `evals/runs/` gains the noise-floor run, the smoke run and each candidate run.
  Existing records stay valid; the new summary field is computed when absent.
- **Spend:** about $1 for the noise-floor run, a smoke run under $0.25, and $0.25–0.40 per Sonnet
  run (at most two candidates plus one confirmation) — each under its own mandatory cap. Expected
  total under $2.50.
- **Users:** after the switch, the chat answers on a different model. The streamed events and the
  map payload keep their shape.
- **No new dependencies.** The installed `@anthropic-ai/sdk` (0.124.0) already types top-level
  `cache_control`.
