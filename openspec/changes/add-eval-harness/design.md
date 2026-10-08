# Design

## Context

See proposal.md — Why. The state this design builds on, checked in the code:

- `runAssistantLoop` (`src/lib/assistant/loop.ts`) depends only on the `AssistantModelClient`
  interface (`model-client.ts`), never on `Anthropic` directly. Every existing test drives it with
  `createFakeModelClient` (`test-fixtures.ts`). That seam is what makes both the metering and the
  runner testable offline.
- The loop never reads `message.usage`. It returns `messages`, `toolCalls` (name, input, parsed
  result, error flag — no iteration index), `stopReason` and `truncated`.
- The model settings live as constants inside `src/app/api/chat/route.ts`: `MODEL = "claude-opus-5"`,
  `MAX_TOKENS = 4096`, `EFFORT = "low"`. Thinking is set in the loop: adaptive, `display:
  "summarized"`. No `cache_control` and no `tool_choice` anywhere.
- `projectHighlight` (`highlight.ts`) builds the payload only from `detail_optical_budget` results.
  A turn answered from the survey alone highlights nothing. The highlight grader has to live with
  that — see Decision 7.
- `npm test` runs `vitest run` over `src/**/*.test.ts`. There is no TypeScript runner for scripts
  outside Next.js; `tsconfig.json` maps `@/*` to `./src/*`.
- `seed/expected-budgets.json` is the hand-derived optical oracle: NAP-09 fails (−1.4 dB), NAP-12 is
  marginal (2.77 dB), the other ten pass; NAP-06 is the tightest pass at 3.44 dB.
- Models cannot be sampled deterministically: Opus 5 rejects `temperature`. Two runs of the same
  configuration can disagree. Measuring how much needs two runs of the same configuration; that
  second run is deferred to `reduce-cost-per-question` (Decision 15).

## Goals / Non-Goals

**Goals:**

- Measure what users get: the same loop, prompt, tools and model settings as the route, so a
  number in the README describes the product, not a test double.
- Make every eval decision reproducible from a committed file, without calling the API again.
- Keep all new logic — graders, cost, statistics, the cap, the runner's control flow — under unit
  tests that never touch the network.

**Non-Goals:**

- Parallel case execution. Sequential is slower but keeps the spend cap exact, latency
  uncontaminated by concurrency, and rate limits out of the picture.
- Retrying failed cases beyond the SDK's own retries (two, by default).
- A general-purpose eval framework. The case format, graders and oracles are built for this
  assistant and its four tools; each capability change extends them.

## Decisions

### 1. The runner drives the loop in-process, not the HTTP route

The runner calls `runAssistantLoop` and `projectHighlight` directly, with a real model client.

*Alternative: POST to `/api/chat` on a running dev server and parse the SSE stream.* It would cover
the route's wiring too, but it needs a server running, makes timing include Next.js, and the
runner would have to reconstruct tool results from the `done` event's message array. The route is
pure wiring by design (its own header says so) and is exercised by hand on every recorded live run.

### 2. One shared module holds the model settings

`MODEL`, `MAX_TOKENS`, `EFFORT` (and the thinking setting, today hard-coded in the loop) move to
`src/lib/assistant/config.ts`. The route and the runner both import it. This is what makes "the
eval exercises the assistant the app serves" true by construction — and it is the one knob
`reduce-cost-per-question` will turn. The move changes no value.

The runner may override the model and effort from the command line (`--model`, `--effort`) so the
next change can run candidates without editing the file; the override is recorded in the run
record, and without it the shared values apply.

### 3. Metering wraps the model client; the loop gains only an iteration index

`withUsageMetering(client, onCall)` returns an `AssistantModelClient` that times each `createTurn`
from the request to `finalMessage()` resolving, reads `message.model` and `message.usage`, prices
the call, and hands a `ModelCallRecord` to `onCall` — including when a later call in the turn
throws, because each record is emitted as soon as its own call completes. `summarizeTurn(calls,
toolCalls)` is a pure function that sums them.

The loop's only change: `ToolCallRecord` gains `iteration` (the 1-based model call that requested
it). The trajectory grader needs it to tell "detail after survey" from "both in one iteration", and
the route's log line reports it.

*Alternative: accumulate usage inside the loop and return it.* It works for successful turns but
loses the spend of a turn that throws mid-way — exactly the turns whose cost is easiest to forget.
*Alternative: a new SSE event carrying usage.* It changes the client contract for something the
page does not show (proposal, Non-goals).

`message.model` is used rather than the requested model so that a turn served by a different model
(a refusal fallback, for instance) is priced at the rate actually billed — or, if that model is not
in the table, recorded as unpriced rather than silently priced wrong.

Token semantics follow the API: `input_tokens` excludes cached tokens; cache reads and cache
writes are reported in their own fields and priced separately. Thinking tokens are billed as
output and already counted in `output_tokens`.

### 4. Pricing is an explicit per-model table with provenance

`src/lib/assistant/pricing.ts` holds, per model, four rates in US dollars per million tokens —
input, output, cache write (5-minute TTL), cache read — plus `PRICES_VERIFIED_ON` and the source.
Initial values, from the `claude-api` skill's model table (cached 2026-10-06), verified 2026-10-08:

| Model | Input | Output | Cache write (5 min) | Cache read |
|---|---|---|---|---|
| `claude-opus-5` | 5.00 | 25.00 | 6.25 *(derived: 1.25 × input)* | 0.50 *(derived: 0.1 × input)* |
| `claude-opus-5-5` | 4.00 | 20.00 | 5.00 *(derived: 1.25 × input)* | 0.20 *(stated)* |
| `claude-sonnet-5-5` | 2.00 | 10.00 | 2.50 *(derived: 1.25 × input)* | 0.20 *(stated)* |

Explicit rates rather than one multiplier, because the source already shows they differ: Opus 5.5's
cache read is $0.20, which is 0.05 × input, not the 0.1 that holds for the others. A derived value
is marked as derived in its comment, so it can be checked and replaced. `computeCost(model, usage)`
returns `null` for a model the table does not list; it never guesses a rate.

The three models listed are the ones `reduce-cost-per-question` will compare; listing them now
costs nothing and means the comparison runs need no pricing change.

### 5. Logic in `src/lib/evals/`, thin entry points run with `tsx`

Everything that decides anything — case loading and validation, graders, the runner's control
flow (turn sequencing, spend cap, outcome classification, record assembly), statistics and run
comparison — lives in `src/lib/evals/` and is unit-tested by the existing `vitest` setup, the
runner against `createFakeModelClient`. `evals/run.ts` and `evals/compare.ts` only parse arguments,
build the real client, read and write files, and print. Like the route, they are not unit-tested.

They run with `tsx` (new dev dependency), which honours the `@/*` path alias. Scripts:

- `npm run eval -- --max-usd <cap> [--cases <glob>] [--model <id>] [--effort <level>]`
- `npm run eval:compare -- <runA.json> <runB.json>`

`npm run eval` loads `.env.local` the way Next.js does (Node's `--env-file-if-exists`), so the same
`ANTHROPIC_API_KEY` works for both.

*Alternative: a second vitest config that runs `*.eval.ts` files.* No new dependency, but test
semantics fit badly: a case that fails its graders is a measurement, not a broken test, and the
spend cap and run record are whole-run concerns that vitest's per-test model fights.

### 6. Cases are JSON, one file per area

`evals/cases/<area>.json` holds an array of cases. One file per area keeps a capability's cases
together (each later change adds its own file) and keeps diffs reviewable. A case:

```json
{
  "id": "budget-failing-es",
  "area": "budget",
  "source": "add-map-copilot/verification.md §1",
  "turns": ["¿qué cajas no cierran el presupuesto óptico?"],
  "expect": {
    "trajectory": {
      "required": ["summarize_optical_budgets", "detail_optical_budget"],
      "order": [["summarize_optical_budgets", "detail_optical_budget"]]
    },
    "highlight": { "mode": "equals", "ids": ["NAP-09", "NAP-12"], "oracle": "non_passing" },
    "grounding": true
  }
}
```

The loader validates the whole set before any call — unique ids, a known area, known tool names,
oracle ids that exist in the loaded network, at least one turn — and fails naming the file and
case, the same loud-failure contract as the network and corpus loaders.

An optional `oracle` tag on a highlight expectation declares what the hand-written set claims to be.
A unit test checks every case tagged `non_passing` against `seed/expected-budgets.json`, so a seed
edit that changes which NAPs fail breaks a test instead of silently staling the eval. The ids stay
hand-written in the case: the oracle must not be computed by the engine it is judging.

### 7. Graders

Each grader is a pure function of the graded turn — final text, final assistant message, tool
calls with iterations, projected payload — plus the conversation's earlier tool results and user
turns. Each returns `{ pass, reasons[] }`. A case declares which graders apply; it passes when all
of them do.

- **Trajectory.** `required` tools were called (optionally with an input match, e.g.
  `min_margin_db: 4`); `forbidden` tools were not; for each `[a, b]` in `order`, the first call of
  `a` has a lower iteration than the first call of `b`. Two tools in the same iteration are *not*
  ordered.
- **Highlight.** Set of entity ids in the payload vs the oracle, `equals` or `contains`. Only
  declared on cases where the reference behaviour requires a detail call — a survey-only answer
  projects nothing (Context), and grading that as a failure would measure the projection rule, not
  the model.
- **Grounding.** See Decision 8.
- **Abstention.** Payload empty and grounding passes. Composed from the other two rather than a
  separate check, so it inherits grounding's validation.
- **Figures.** Each required figure appears in the answer, by the same number parsing as grounding.
- **Citation.** The final message carries at least one text block with citations, or its text names
  the `source` or `title` of a `search_result` the search tool returned in this turn.

The last two go beyond the handoff's four graders. They are deterministic and cover two
hand-verified behaviours the four cannot: surfacing *both* attenuation values, and citing the
document.

### 8. Number grounding

**Extraction from the answer.** Numbers matching an optional sign (`-`, `−`, `+`), digits, and an
optional decimal part with `.` or `,`. Excluded before matching: tokens inside an identifier
(`NAP-12`, `FR-03`, `OLT-RES-01`, `SUB-014` — letters, hyphen, digits), splitter ratios (`1:16`),
and ordered-list markers at the start of a line (`1.`, `2)`). Wavelengths are *not* excluded:
`1490` must be grounded like any other figure.

**Ambiguous separators.** `1.650` and `1,650` may be a decimal or a Spanish/English thousands
group. The grader accepts the token if *either* reading is grounded.

**Sources.** Every number in the tool results visible in the conversation — JSON numbers anywhere in
a parsed result, plus numbers in the text of `search_result` blocks — and every number in the
user's own messages. "Visible in the conversation", not "of that turn": in a follow-up the model
legitimately repeats figures it fetched a turn earlier (the Phase 1 verification shows exactly
that), and they are still tool output. The system prompt is not a source.

**Matching.** Numeric equality after parsing, so `29.4` matches `29.40` and `-1,40` matches `-1.4`.
`2.7` does not match `2.77`: reproducing a figure means reproducing it. An absolute-value-only match
passes but is recorded as `sign_only`, because "1.40 dB below the budget" is a correct way to say
−1.40 and failing it would be a false positive — but a flipped margin sign is a real error worth a
human look.

**Known limit: membership, not attribution.** The grader checks that a number exists in some
source, not that it is attached to the right entity. Saying NAP-07's margin is 2.77 passes. Small
integers are the weak spot: `2`, `3`, `12` appear somewhere in almost any result. This catches
invented and re-derived figures (the 2.7 and 20.8 scenarios in the spec), which is the failure mode
the project's core rule is about; misattribution would need an entity-aware check or a judge, and
neither is in this change.

**Validation before trust** (spec: "validated by hand"). After the first baseline run, at least 15
final answers — covering every area, and every answer the grader flagged — are checked by hand,
number by number. Findings go to `evals/grader-validation.md`: per answer, numbers flagged, numbers
a human would flag, false positives, false negatives. Any false positive is fixed in the grader and
the validation repeated on the same answers. Until that file records zero false positives, the
grounding grader's results are reported but not used as a veto.

### 9. The spend cap

`--max-usd` is required. Before each case, the runner stops if `spent + maxCaseCostSoFar > cap`;
before the first case `maxCaseCostSoFar` is 0, so the first case always runs. The cap can be
overshot only by a case that costs more than every case before it. A case in progress is never interrupted — stopping
mid-conversation would waste what it already spent and produce an ungradable record. Remaining cases
are recorded as `skipped_budget` and the record is marked `partial`.

A call whose cost is `null` (unpriced model) ends the run after that case: the cap can no longer be
enforced, and continuing would spend blind.

### 10. Outcomes and errors

A case is `pass`, `fail`, `error` or `skipped_budget`. `error` covers an API failure after the
SDK's retries and a loop that hit its iteration cap (`truncated`). Errors are excluded from pass
rates and reported beside them; a run with any error is marked `incomplete` and should not become a
baseline. A refusal (`stop_reason: "refusal"`) is *not* an error — it is the model's answer, graded
like any other.

### 11. The run record

`evals/runs/<UTC timestamp>.json`, committed. Top level: schema version, start and end time, git
commit, model and effort actually used (and whether overridden), `prompt_hash`, cap, spent, status
(`complete` / `partial` / `incomplete`), and the summary. Per case: outcome, per-grader
`{ pass, reasons }`, sign-only matches, and per turn the user text, final answer text, trajectory
(tool name, input, iteration, error flag — not the full results, which the seed reproduces), and per
call model, tokens, cost, latency.

`prompt_hash` is SHA-256 over a canonical JSON of the system prompt, the tool definitions and the
request settings other than the model (max tokens, thinking, effort). The model is recorded beside
it, so two records compare as "same prompt, different model" at a glance.

Answer texts are committed. They are synthetic-network answers with nothing private in them, and
without them a discordant case could not be read without paying to re-run it — which change 0b's
"read every discordant case by hand" depends on.

### 12. Statistics

In `src/lib/evals/stats.ts`, unit-tested:

- **Pass rate** per area and overall: passes / completed (excluding `error` and `skipped_budget`).
- **95% Wilson score interval** (z = 1.96). Preferred over the normal approximation, which goes
  out of [0, 1] and is badly calibrated at n ≈ 20 and rates near 85–100%.
- **Median**: mean of the two middle values for even n.
- **95th percentile**: nearest rank, `ceil(0.95 · n)`-th sorted value. No interpolation: with n ≈ 20
  an interpolated p95 invents a value between observations.
- **Per question** means per user turn, so a two-turn case contributes two cost and latency
  samples. Latency per question is the sum of its calls' latencies — model time, excluding tool
  execution, which is microseconds here.

The runner prints the summary and stores it in the record. The README table is copied from that
stored summary; no figure is computed anywhere else.

### 13. Run comparison

`compareRuns(a, b)` pairs cases by id and lists: pass→fail, fail→pass, cases present in only one
run, and cases errored or skipped in either. Only cases completed in both runs enter the two
counts. Over two runs of the same configuration, the flipped cases are the noise floor and are
listed as unstable; statistical testing on these counts belongs to `reduce-cost-per-question`, which
also makes that second run (Decision 15).

### 14. The ~20 baseline cases

Areas and cases (the case files are the source of truth; this is the starting set):

| Area | Case | Turn(s) | Graders |
|---|---|---|---|
| budget | `budget-failing-en` | "which NAPs fail the optical budget?" | trajectory (survey → detail), highlight = {09, 12} non_passing, grounding |
| budget | `budget-failing-es` | "¿qué cajas no cierran el presupuesto óptico?" | same |
| budget | `budget-limit-es` | "¿hay alguna caja al límite del margen?" | trajectory (survey), highlight ⊇ {12}, grounding, figures 2.77 |
| budget | `budget-why-nap12-es` | "¿por qué la NAP-12 está al límite?" | trajectory (detail NAP-12), highlight = {12}, grounding, figures 13.5 / 3.5 |
| budget | `budget-detail-nap07` | "give me the loss breakdown for NAP-07" | trajectory (detail NAP-07), highlight = {07}, grounding |
| budget | `budget-rx-nap09-es` | "¿con cuánta potencia llega la señal a la NAP-09?" | trajectory (detail NAP-09), highlight = {09}, grounding, figures −26.4 |
| budget | `budget-margin-4db-es` | "¿qué cajas quedan por debajo de 4 dB de margen?" | trajectory (survey with `min_margin_db: 4`), grounding, figures 3.44 — *hard*: NAP-06 (3.44) joins |
| budget | `budget-nap01-ok-es` | "¿la NAP-01 cierra el presupuesto?" | trajectory (survey or detail), grounding |
| docs | `docs-cascade-en` | "How does cascaded splitter loss affect a link budget?" | trajectory (search), citation, grounding, highlight empty |
| docs | `docs-rain-es` | "¿por qué se cae la señal cuando llueve?" | trajectory (search, non-empty result), citation, grounding |
| docs | `docs-attenuation-en` | "What fiber attenuation value at 1490nm should I assume?" | trajectory (search + constants), figures 0.22 and 0.25, grounding |
| docs | `docs-attenuation-es` | "¿qué atenuación de fibra a 1490 nm tengo que asumir?" | same |
| docs | `docs-connector-es` | "¿qué pérdida por conector usa el sistema para calcular?" | trajectory (constants), figures 0.4, grounding |
| abstention | `abstain-ont-en` | "What is the ONT receiver sensitivity?" | abstention |
| abstention | `abstain-ont-es` | "¿cuál es la sensibilidad del receptor de la ONT?" | abstention |
| abstention | `abstain-nap13-es` | "¿cuál es el margen de la NAP-13?" | abstention |
| abstention | `abstain-vendor-es` | "¿qué marca de ONT me conviene comprar?" | abstention, trajectory (no budget tools) |
| abstention | `abstain-docs-gap-en` | "What OLT firmware version do you recommend?" | abstention |
| conversation | `conv-and-nap12-es` | "¿qué cajas no cierran el presupuesto óptico?" → "¿y la NAP-12?" | grounding, figures 2.77 |
| conversation | `conv-second-one-en` | "which NAPs fail the optical budget?" → "why is the second one marginal?" | grounding, figures 2.77 |
| conversation | `conv-ont-after-budget-es` | "¿qué cajas no cierran el presupuesto óptico?" → "¿cuál es la sensibilidad del receptor de la ONT?" | abstention (Phase 1 §2: declining holds after figures are in context) |

The eight hand-verified behaviours map to: survey before detail (budget-failing-*), declining
(abstain-ont-*, conv-ont-after-budget-es), citing (docs-cascade-en, docs-rain-es), Spanish → English
corpus (docs-rain-es), the contradiction (docs-attenuation-*), ONT still declined with docs
(abstain-ont-en), map highlight (every highlight grader), declining with the map (abstain-ont-es).

The hard cases (`budget-margin-4db-es`, `budget-limit-es`, the follow-ups, the docs-gap decline) are
there on purpose: the handoff's power analysis needs discordant pairs, and an all-easy set produces
none.

### 15. Spend only when a live answer is the thing being measured

Owner decision, 2026-10-08: avoid every model call that is not strictly needed. Three consequences:

- **Re-grading is offline.** Each trajectory step in a run record carries a SHA-256 of its tool
  result. `regradeRecord(record, cases, network, searchIndex)` rebuilds each graded turn by
  re-dispatching the recorded tool calls against the seed and corpus — the tools are deterministic —
  checks every rebuilt result against its hash, and re-runs the graders with the cases' *current*
  expectations. A hash mismatch (the seed, corpus or engine changed since the run) refuses to
  re-grade that case rather than grading against results the model never saw. `npm run
  eval:regrade -- <run.json>` writes `<run>.regraded.json` beside it and prints what flipped. Fixing
  a grader, or tightening a case's expectations, therefore never needs a new run.
  *Alternative: store full tool results in the record.* Simpler, but it multiplies the committed
  file size by the search passages and budget breakdowns of every turn; re-dispatch plus a hash
  gives the same guarantee for a few bytes per call.
- **A smoke run first.** Two cases under a $0.50 cap measure the real cost per question before the
  full run is paid for.
- **One baseline run, not two.** The noise floor only matters when two configurations are compared,
  which first happens in `reduce-cost-per-question`; its first live task is the second run of the
  baseline configuration. If that change never happens, the run is never paid for.

## Risks / Trade-offs

- **[Grounding false positives make the grader worse than none]** → hand validation on ≥15 answers
  before it gates anything (Decision 8); `sign_only` and ambiguous-separator handling exist to
  absorb the two false-positive sources visible in the archived answers.
- **[Membership, not attribution: a misattributed real number passes]** → stated in the README as a
  known limit; figures graders pin the most important numbers to specific cases; a judge is a later
  change.
- **[n ≈ 20 per area gives intervals ±15 points wide]** → reported with *n* and interval, never as a
  headline; per-area numbers are context, the overall rate is the one compared.
- **[Live non-determinism makes one run unrepresentative]** → the README states the baseline is a
  single run; the second run, its comparison and the unstable list come with
  `reduce-cost-per-question`, before any configuration is judged against the baseline.
- **[Abstention grader too weak: "NAP-13 has 2.77 dB margin" passes]** → known; the highlight half
  still catches a decline that reached a detail call; documented as the trigger for a calibrated
  judge in a later change.
- **[Prices drift or a derived cache rate is wrong]** → dated, sourced, derived values marked;
  `reduce-cost-per-question` compares ratios across runs priced by the same table, which is robust
  to a uniform error.
- **[Spend]** → mandatory cap; at today's ~630 tokens of tool output per reference question and
  Opus 5 prices, one 21-case run is expected in the low single dollars, measured by the first run
  rather than assumed.
- **[Highlight graded only where a detail call is required]** → survey-only cases still get
  trajectory and grounding; widening highlight projection is a product change for a later spec.
- **[Moving model settings into a shared module touches the route]** → a pure move, values
  unchanged; the existing route behaviour is re-checked by one live question after the move.

## Migration Plan

No data or contract migration. The route's streamed events and payload are unchanged; the only
user-visible effect is a log line per turn on the server. Rollback is reverting the change; the
committed run records stay valid as history.

## Open Questions

- The cache-write rates are derived (1.25 × input) and no current request writes the cache, so they
  do not affect the baseline. Confirm them against the pricing page before
  `reduce-cost-per-question` turns caching on.
