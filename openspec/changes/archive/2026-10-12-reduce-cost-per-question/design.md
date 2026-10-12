# Design

## Context

See proposal.md — Why. The state this design builds on, checked in the code and in the baseline
record on 2026-10-09:

- **Where the cost is.** `evals/runs/2026-10-08T03-32-06Z.regraded.json`: 24 questions, 48 model
  calls, 156,031 input and 9,837 output tokens; input $0.780, output $0.246. Cache reads: zero.
  The shortest first call (`abstain-ont-en`) is 2,461 input tokens, so the fixed prefix — four tool
  definitions plus the system prompt — is about 2,440 tokens and the question itself a few dozen.
  Most questions take 2 calls; the survey-then-detail ones take 3.
- **The request.** `runAssistantLoop` (`src/lib/assistant/loop.ts`) sends `system` as a plain
  string, `tools`, `messages`, `thinking: THINKING` and `output_config.effort`. No `cache_control`,
  no `tool_choice`. Model settings live in `src/lib/assistant/config.ts`, shared by the route and
  the eval runner (add-eval-harness, decision 2).
- **History is append-only.** The loop appends each `message.content` unchanged; the route returns
  the full array in the `done` event and the page sends it back verbatim on the next request. No
  reminder is injected and deleted, no tool set changes mid-conversation. This matters for
  preserved thinking on Opus 5.5 and Sonnet 5.5 (Decision 8).
- **The page shows only `text`.** `ChatPanel` renders text deltas; thinking blocks are neither
  streamed to nor shown to the user.
- **Prompt hash.** `promptHash(system, tools, settings)` covers the system prompt, tool definitions
  and request settings other than the model. The record carries `model`, `effort`, `overridden`.
- **Records are re-gradable offline** (`regradeRecord`, add-eval-harness decision 15) and
  `summarizeRun(cases)` recomputes a summary from case data alone.
- **SDK.** `@anthropic-ai/sdk` 0.124.0 types top-level `cache_control` on `messages.stream` params,
  and `system` as `string | TextBlockParam[]` with `cache_control` per block.
- **API facts this design relies on** (claude-api skill, cached 2026-10-06; verified again when
  `pricing.ts` is touched, task 2.1): minimum cacheable prefix 512 tokens on Opus 5, Opus 5.5 and
  Sonnet 5.5; render order `tools → system → messages`; cache writes 1.25× input (5-minute TTL);
  cache reads 0.1× input on Opus 5, $0.20 on Opus 5.5 and Sonnet 5.5; caches are model-scoped; a
  top-level `effort` or thinking change invalidates the messages cache; reads can only land where an
  earlier request wrote a breakpoint.

## Goals / Non-Goals

**Goals:**

- A verdict on each candidate that a person can recompute from three committed files, offline.
- A cost figure that does not depend on the order the eval ran its cases in.
- Caching that is provably billing-only: what the model reads is byte-identical with and without it.

**Non-Goals:**

- A general model-selection framework. The rule is for this eval and this change; a later change
  that compares configurations reuses `decide` as it stands or changes it by its own spec.
- Re-running the baseline after caching ships. Both baseline runs are uncached Opus 5, taken before
  any code changes (Decision 1).

## Decisions

### 1. The noise-floor run comes first, before any code changes

The second run of the baseline configuration (B2) is the first live task, on an untouched tree.
Its record must carry the same model, effort and prompt hash as the published baseline (B1);
`decide` refuses a mismatched pair (spec: "Mismatched baselines give no verdict").

*Alternative: implement caching first and add a `--no-cache` flag to run the baseline later.* One
more knob that exists only to reproduce the past, and a risk that the "baseline" run differs from
B1 in some other way the flag does not cover. Running B2 first on the same commit range costs
nothing extra and needs no flag.

### 2. Two cache breakpoints: the end of the system prompt, and the conversation tail

Every request carries:

- `system` as one text block with `cache_control: { type: "ephemeral" }` (5-minute TTL). Tools
  render before system, so this one marker covers the whole ~2,440-token prefix. It is the read
  point a *new* question can hit: reads only land where an earlier request wrote a breakpoint, and
  every request writes this one at the same position.
- top-level `cache_control: { type: "ephemeral" }` (automatic caching), which places a breakpoint on
  the last block and moves with the conversation. It lets the second and third calls of a turn read
  the question, the survey result and the previous thinking from cache, instead of only the prefix.

This is the "explicit prefix marker plus automatic tail" combination the API guidance recommends
for agent loops; it uses 2 of the 4 breakpoint slots.

*Alternative: automatic caching only.* Within a turn it works, but each question's breakpoints sit
at its own tail, so the next question finds no entry at the end of the system prompt to read —
cross-question reuse, the warm case, disappears. *Alternative: the system marker only.* Cross-
question reuse works, but every later call of a turn re-pays the question and tool results.

Cost of the choice: a one-call question pays the 1.25× write on its whole input with nothing read
back. The cold figure (Decision 3) charges exactly that, so the trade is measured, not assumed.

The setting is `PROMPT_CACHING = true` in `config.ts`; `runAssistantLoop` takes it as a parameter
like `effort`, and the route and runner both pass it. The loop is the only place markers are added.
No marker ever goes inside `messages`, so the history the page round-trips is unchanged.

### 3. Cold cost re-prices the first call's cache reads as writes

For each question (user turn), cold cost = measured cost + `cache_read(first call) × (write rate −
read rate)` of the model that served that call. Rationale: a question arriving alone would have had
to write what its first call read; every later call of the same question would still read what the
first one wrote, so those reads stay. Without caching, cold = measured.

It is computed in `stats.ts` from `TurnRecord.calls` and the pricing table, so it works on every
record, old or new. `decide` recomputes summaries from case data with `summarizeRun` instead of
trusting a stored summary, so the two baseline records, written before this field existed, are
judged by the same code as the candidates.

*Alternative: make the eval itself cold* (wait out the TTL between cases, or vary a prefix byte per
case). Waiting is 5+ minutes × 21 cases; perturbing the prefix changes what the model reads. Both
are worse than an exact re-pricing of recorded token counts.

Known conservatism: a follow-up in a multi-turn case (`conv-*`) realistically arrives warm, but its
first call is re-priced cold too. This makes the figure slightly pessimistic, never optimistic.

### 4. The decision rule, scaled from ~80 cases to 21

The rule is in the spec ("A cheaper configuration is accepted only by a rule fixed in advance").
How each part maps from the handoff's version:

| Handoff (n ≈ 80) | Here (n = 21) | Why |
|---|---|---|
| Veto: grounding/abstention pass in baseline, fail in candidate | Same, but only where the grader passed in **both** baseline runs | A grader that already flips between two identical runs cannot tell a regression from noise. |
| McNemar not significant, point estimate loses ≤ 5 points | Candidate passes ≥ min(B1, B2) − 1 | One case is 4.8 points. Anchoring on the worse baseline absorbs the noise the replicate measured. McNemar is reported, not gated: with < 6 discordant cases nothing can be significant, so a significance gate would accept anything. |
| ≤ 2 new failures per area (3 rejects) | ≤ 1 new failure among stable cases per area (2 rejects) | Areas hold 5–8 cases here, not ~20. |
| Every discordant case read by hand | Same, and acceptance is provisional until it is done | The automatic checks can't see a misattributed figure (grounding checks membership, not attribution). |
| — | Cost on cold median ≤ 50% of B1 | Owner decision, 2026-10-09. B1's median ($0.0376) is fixed now; B1 had no caching, so cold = measured. |
| — | Caching on and zero reads → reject | An inert cache means the measured cost is not the configuration's real cost. |

The reference for cost and for McNemar is B1, the published baseline, not B2 — fixed before any
candidate runs, so the target cannot move after a result is seen.

The hand reading goes in `evals/decision-log.md`: one section per candidate run, one entry per
listed case — what changed, and whether any figure in the answer did not come from a tool. A
reading that finds one rejects the candidate (spec).

### 5. `decide` is pure; the CLI re-grades before deciding

`src/lib/evals/decide.ts` exports a pure `decide({ baseline, replicate, candidate })` over three
`RunRecord`s and returns `{ verdict: "accept_provisional" | "reject" | "no_verdict", reasons[],
toRead[], mcnemar, cost }`. It is unit-tested on synthetic records, one test per spec scenario.

`evals/decide.ts` (`npm run eval:decide -- <baseline> <replicate> <candidate>`) reads the three
files, **re-grades all three in memory** with the current graders (`regradeRecord`, offline), then
calls `decide` and prints. This guarantees the three are judged by the same grader version without
a version field in the record. A re-grade that refuses a case (hash mismatch) makes the verdict
`no_verdict`.

### 6. Exact McNemar in `compareRuns`

Two-sided exact test on the discordant counts b (pass→fail) and c (fail→pass): `p = min(1, 2 ·
P(X ≤ min(b, c)))`, `X ~ Binomial(b + c, 0.5)`; `p = 1` when b + c = 0. With at most 21 discordant
cases, the binomial terms are computed exactly in doubles (largest coefficient C(21, 10) =
352,716). It goes in `stats.ts` as `mcnemarExact(b, c)` and is added to `RunComparison`.

### 7. Candidates in order, stopping at the first accepted; Opus 5.5 is not run

Owner decision, 2026-10-09: stop at the first configuration that passes. Every candidate runs with
caching on. Re-pricing the baseline's own token counts at each model's prices, with Decision 2's
caching:

| Configuration | Cold median, % of baseline | Measured (warm) median |
|---|---|---|
| Opus 5 + caching | 92% | 55% |
| Opus 5.5 + caching | 71% | 42% |
| Sonnet 5.5 + caching | 37% | 22% |

This is a projection, not a measurement — token counts change with the model — but it settles the
order:

1. **`claude-sonnet-5-5`, effort `low`.** The skill's starting point for chat-like routes; projected
   well under target.
2. **`claude-sonnet-5-5`, effort `medium`**, only if 1 is rejected on quality. Its levels are
   recalibrated from Sonnet 5, so `low` here is not the same depth as `low` on Opus 5.
3. **`claude-opus-5-5` is not run.** At baseline token counts it re-prices to 71% cold; to reach 50%
   it would need ~30% fewer tokens per question, and the migration notes say it thinks *more* per
   effort level than Opus 5. Under a cold-cost rule it cannot be accepted, so paying for its run
   buys nothing. It appears in the README table as "not run", with this projection as the reason.

The accepted candidate gets a second, confirming run that must also pass `decide` against B1/B2.
One lucky run is not enough to switch the product's model; one more run at Sonnet prices is about
$0.25.

If neither Sonnet configuration is accepted, no model changes. The deliverable is then the table
and the reasons, which the handoff's definition of done allows.

### 8. Caching ships whatever the verdict; the model changes only on an accepted verdict

Caching changes no byte the model reads (spec: "Caching changes nothing the model reads", tested by
comparing the request built with and without it), so it cannot change behaviour and needs no
quality gate. It ships in every outcome. On warm traffic it saves a lot; on cold traffic little;
it is never more expensive than about 1.25× on a one-call question's input, which the cold figure
already counts.

The model switch is a one-line change in `config.ts` (`MODEL`, `EFFORT`). Nothing else in the
request changes on Sonnet 5.5: thinking stays `{ type: "adaptive", display: "summarized" }`, which
it accepts; `tool_choice` is not used; there is no prefill. Preserved thinking needs append-only
history, which the harness already has (Context). A conversation open across the deploy replays
Opus 5 thinking blocks to Sonnet 5.5, which drops blocks it cannot read without error or charge.

### 9. Smoke run before every full run

As in add-eval-harness (decision 15): two cases (`budget-failing-*`) under a $0.25 cap on the
first candidate configuration. It checks, before a full run is paid for, that the first call writes
roughly the 2,440-token prefix, that later calls read it, and what a question costs on the new
model.

## Risks / Trade-offs

- **[n = 21 cannot detect a 10-point drop]** → stated in the README; the veto and the hand
  reading carry the weight a significance test cannot. A confirming run of the winner halves the
  chance of switching on one lucky run.
- **[The eval warms the cache across cases; the demo does not]** → the target is judged on cold
  cost (Decision 3); measured cost is reported beside it, labelled.
- **[Sonnet 5.5 takes more turns or thinks longer, eating the price advantage]** → measured, not
  assumed; the smoke run shows it before a full run is paid for.
- **[Grounding grades less text on the new models]** → on Sonnet 5.5 and Opus 5.5 notes between
  tool calls come back as `thinking` blocks, which the grader does not read and the page does not
  show. The grader still checks everything the user sees. A figure that only moved into thinking
  cannot mislead anyone, but the hand reading watches for answers that got shorter in suspicious
  places.
- **[A quieter chat during tool calls]** → accepted (proposal, Non-goals). The final answer streams
  as before.
- **[A derived price is wrong]** → the cache-write rates are confirmed against the stated rule before
  caching ships (task 2.1); a uniform pricing error moves both sides of a ratio together.
- **[The baseline's second run disagrees a lot with the first]** → that is the finding. If B1 and B2
  differ on more than 4 cases, the rule still applies, but the README states that the eval's noise
  is too high for a 21-case comparison to mean much.
- **[Safety classifiers decline a domain question on Sonnet 5.5]** → a refusal is graded as the
  answer (add-eval-harness, decision 10) and shows up as a failed case to read.

## Migration Plan

1. B2, untouched tree. 2. Caching and the eval changes, under unit tests; merged on their own — no
behaviour change. 3. Candidate runs and decisions. 4. If a candidate is accepted and confirmed:
`config.ts` switches, one live question in the app checks the route on the new model, README and
`CLAUDE.md` updated. Rollback is reverting `config.ts`; caching can be turned off by
`PROMPT_CACHING = false` without reverting anything else. Run records stay valid as history.

## Open Questions

- Opus 5.5 is not run here under a cold-cost rule (Decision 7). Whether it is worth switching to
  for its own sake (lower price than Opus 5, same tier) is a question for a later change, with its
  own runs; it does not affect this one.
