## Why

**Phase 4 — production, first item.** Eight assistant behaviours — survey before detail, every
figure reproduced from a tool, declining what the system does not model, citing documentation,
surfacing the attenuation contradiction, answering Spanish questions from an English corpus,
highlighting the right NAPs — were verified by hand, once, against the live API. Nothing watches
them. The README says so: *this project has no evals*.

That debt is about to grow. The handoff of 2026-10-07 (`docs/handoff/2026-10-07-map-user-capabilities.md`)
plans a cost reduction (`reduce-cost-per-question`) and three new capabilities (subscriber trace,
cut impact, feasibility). Each one changes what the model sees. Without a measured baseline of
today's behaviour, no later claim of "still works" or "half the cost" means anything — and the
model-change decision rule in the next change needs paired runs, a known noise level and a
recorded cost per question to exist before it can be applied. So the eval comes first.

## What Changes

- **Per-call instrumentation.** Every model call the assistant makes records the model that served
  it, input / output / cache-read / cache-write tokens (from `message.usage`), latency, and cost.
  Each turn adds up its calls and records the number of iterations and the tool trajectory. The
  chat route logs one structured line per turn, server-side. The SSE contract and the page do not
  change.
- **Cost is computed in code** from a pricing table in configuration, with the date the prices were
  verified and where they came from — the same discipline as the optical constants. The model
  never produces a cost figure.
- **An eval runner, `npm run eval`**, separate from `npm test`. `npm test` keeps its rule: it never
  calls the API. The runner drives the same loop, prompt, tools and model settings the route uses,
  in-process, case by case.
- **A mandatory spend cap.** The runner refuses to start without one and checks it before every
  case.
- **Cases on disk** in `evals/cases/`: about 20, converting the eight hand-verified behaviours from
  the archived `verification.md` files, plus Spanish phrasings, hard cases and multi-turn
  follow-ups ("¿y la NAP-12?").
- **Deterministic graders only — no LLM judge in this change.** Trajectory, highlight against a
  hand-derived oracle, number grounding, abstention, plus two small content checks (required
  figures, a cited source). The grounding grader is validated by hand against ~15 real answers
  before it is trusted.
- **Run records committed** to `evals/runs/<timestamp>.json`: model, a hash of the prompt and tool
  definitions, per-case pass/fail per grader, final answer text, trajectory, tokens, cost, latency.
- **A comparison of two run records** that lists the cases whose outcome flipped. Run on two
  runs of the same configuration, it gives the pure-noise level of discordance and flags unstable
  cases.
- **Offline re-grading of a recorded run.** Graders change; answers do not have to be bought again.
  A committed record carries enough to re-grade it without calling the model, so fixing a grader
  costs nothing.
- **The baseline, run once**, on today's model (`claude-opus-5`, effort `low`), after a two-case
  smoke run that measures the real cost per question first. The README's "this project has no
  evals" line is replaced by its numbers: pass rate per area with *n* and a 95% Wilson interval,
  median and p95 cost per question, p95 latency. The second run of the same configuration — the
  noise floor — is deferred to `reduce-cost-per-question`, the only change that needs it (owner
  decision, 2026-10-08: no live call before it is needed).
- Every summary statistic (pass rate, interval, median, percentile, cost) is computed by
  deterministic, unit-tested TypeScript — never by the model.

## Capabilities

### New Capabilities

- `assistant-evals`: measuring the assistant's live behaviour — case format, the runner and its
  spend cap, the deterministic graders and their oracles, run records, run comparison, and the
  summary statistics reported from them.

### Modified Capabilities

- `network-assistant`: adds a requirement that every model call's token usage, latency and cost are
  recorded, summed per turn, and logged server-side, with cost computed in code from a dated
  pricing table.

## Non-goals

- **Changing the assistant's behaviour.** No prompt edits, no tool changes, no prompt caching, no
  model or effort change. Those belong to `reduce-cost-per-question`, which is measured *against*
  this baseline. Changing anything here would leave nothing to compare against.
- **An LLM judge.** If the deterministic abstention check proves too weak, a calibrated judge comes
  in a later change.
- **Statistical comparison of two configurations** (McNemar, the veto rule). This change lists the
  discordant cases between two runs; deciding what they mean belongs to `reduce-cost-per-question`.
- **Eval cases for capabilities that do not exist yet** (subscriber trace, cut impact,
  feasibility). Each of those changes adds its own ~20.
- **Running evals in CI.** They spend money and are non-deterministic; they run by hand.
- Showing cost or tokens in the UI, a metrics backend, dashboards, alerting, or persisting the
  server-side logs anywhere.
- Deploy, Docker, AWS.

## Impact

- **Code:** `src/lib/assistant/` gains a metering wrapper around the model client, a pricing
  module and per-turn usage summaries; `ToolCallRecord` gains the iteration it belongs to; the
  model settings the route uses move to a shared module so the runner cannot drift from the app;
  `src/app/api/chat/route.ts` logs one line per turn. New `src/lib/evals/` (case loader, graders,
  runner orchestration, statistics, comparison) with unit tests against fixtures.
- **New files:** `evals/cases/*.json`, `evals/runs/*.json` (committed), `evals/run.ts` and
  `evals/compare.ts` (thin entry points), `evals/grader-validation.md`.
- **Dependencies:** adds `tsx` (dev only) to run the TypeScript entry points with the project's
  path aliases. No runtime dependency, no new service.
- **Cost:** every `npm run eval` spends real money against `ANTHROPIC_API_KEY`, bounded by the cap.
  The smoke run and the single baseline run are the only spend in this change; re-grading,
  comparing and every test are free.
- **README:** the "this project has no evals" paragraph is replaced by the baseline table and how to
  run the suite.
