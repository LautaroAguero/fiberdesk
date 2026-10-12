# Tasks — reduce cost per question

Live work happens only in groups 1, 5 and 6, by hand, each run under its own `--max-usd` cap.
**No task in groups 2–4 may call the Anthropic API**: everything there is verified by unit tests
against `createFakeModelClient`, synthetic records, the seed and the corpus.

Every code task ends green: `npm test`, `npm run lint` and `npx tsc --noEmit` pass before it is
ticked.

The decision rule (spec: "A cheaper configuration is accepted only by a rule fixed in advance";
design.md, decision 4) is fixed by this change's spec. **It is not edited once group 5 starts.**
If a run shows the rule is wrong, the run is recorded, the rule is revised through
`/opsx:update`, and the candidates are judged again from their records. They are not re-run.

## 1. Noise floor (live, before any code change)

- [x] 1.1 On a tree with no change under `src/` since the baseline commit, run the baseline
      configuration a second time: `npm run eval -- --max-usd 1.5`. Verify that the record's `model`
      (`claude-opus-5`), `effort` (`low`) and `prompt_hash` equal those of
      `evals/runs/2026-10-08T03-32-06Z.regraded.json`, that its status is `complete`, and commit it.
- [x] 1.2 Re-grade it offline (`npm run eval:regrade`) and run
      `npm run eval:compare -- evals/runs/2026-10-08T03-32-06Z.regraded.json <B2>.regraded.json`.
      Record in `evals/decision-log.md` (new file, opened with a short header that points to this
      change) the cases that flipped (unstable), the cases that pass in both runs (stable), and per
      case which graders are stable. Verify each list against the compare output by reading both.

## 2. Prompt caching (`network-assistant`)

- [x] 2.1 In `src/lib/assistant/pricing.ts`, confirm the cache-write and cache-read rates against
      the claude-api skill's prompt-caching reference (5-minute write = 1.25 × input; read 0.1 ×
      input on Opus 5, $0.20 on Opus 5.5 and Sonnet 5.5). Change each confirmed rate's comment from
      DERIVED to stated, citing the rule. Update `PRICES_VERIFIED_ON` and `PRICES_SOURCE`. This
      settles the open question in the archived add-eval-harness design; say so in the commit
      message rather than editing the archive. Add the spec's cache-write scenario to
      `pricing.test.ts`: Opus 5, 1,000 in / 2,500 cache-write / 200 out → `0.025625`.
- [x] 2.2 Add `PROMPT_CACHING = true` to `src/lib/assistant/config.ts`, with a comment pointing to
      design.md decision 2. Add an optional `promptCaching` parameter to `runAssistantLoop`. When
      it is true, `system` is sent as one text block with `cache_control: { type: "ephemeral" }`
      and the request carries top-level `cache_control: { type: "ephemeral" }`. Nothing is added
      inside `messages`. Add loop tests:
      (a) with caching on, the request has both markers;
      (b) with caching off, it is byte-identical to today's request;
      (c) with markers stripped, the cached and uncached requests are deep-equal: same system text,
      tools and messages (spec: "Caching changes nothing the model reads");
      (d) the `messages` passed in are not mutated across iterations.
- [x] 2.3 Pass `PROMPT_CACHING` from `src/app/api/chat/route.ts` and from the eval runner, which
      reads it through `EvalConfig`. Verify with a runner test that the fake client receives the
      markers when the config says so. Verify by `grep -n "promptCaching" src/app src/lib/evals`
      that both call sites pass it.

## 3. Records and statistics (`assistant-evals`)

- [x] 3.1 Add `prompt_caching: boolean` to `RunRecord`, written by the runner from `EvalConfig`.
      Records without the field are read as `false`, through one helper used by every reader.
      Keep the field out of `promptHash`: the hash covers what the model reads, and caching is
      billing (design.md, decision 2). Tests:
      (a) a run with caching records `true`;
      (b) the baseline record file, loaded as-is, reads as `false`;
      (c) the prompt hash is the same with and without caching.
- [x] 3.2 Add `coldCost(turn, prices)` to `src/lib/evals/stats.ts` (design.md, decision 3). It
      returns the turn's measured cost plus the first call's cache-read tokens × (write rate − read
      rate) of the model that served that call, or `null` when any call is unpriced. Add
      `cold_cost_per_question { n, median, p95 }` to `RunSummary` via `summarizeRun`, and print it
      in `formatSummary` beside the measured figure, labelled. Tests, one per spec scenario:
      (a) Sonnet 5.5, $0.0100 measured, 2,400 first-call reads → `0.01552`;
      (b) no cache activity → cold equals measured;
      (c) a second call's 3,000 reads stay at the read rate;
      (d) an unpriced model → `null`.
      Also verify `summarizeRun` over the baseline record's cases gives a cold median equal to its
      measured median, $0.037605.
- [x] 3.3 Add `mcnemarExact(b, c)` to `stats.ts`, the two-sided exact test (design.md, decision 6),
      and add `mcnemar_p` to `RunComparison`, printed by `formatComparison`. Tests:
      (a) (5, 1) → `0.21875`;
      (b) (10, 2) → `0.0386` to four decimals;
      (c) (0, 0) → `1`;
      (d) the test is symmetric in b and c;
      (e) the result never exceeds 1, e.g. (3, 3) → `1`.

## 4. The decision rule (`assistant-evals`)

- [x] 4.1 Add `src/lib/evals/decide.ts` with a pure `decide({ baseline, replicate, candidate })`
      over three `RunRecord`s. It recomputes each summary from case data with `summarizeRun` and
      returns `verdict` (`accept_provisional` | `reject` | `no_verdict`), `reasons[]` and `toRead[]`
      (cases whose outcome differs from either baseline), plus the McNemar result against
      `baseline` and the cold-cost comparison against 50% of the baseline's cold median. It gives
      `no_verdict`, naming the cause, for:
      (a) a `partial` or `incomplete` record;
      (b) baselines that differ in model, effort or prompt hash.
      Add `decide.test.ts` on synthetic records, with one test per spec scenario: stable grounding
      veto despite more passes; unstable grader, no veto but listed; net loss 14 vs (16, 15) passes
      and 13 rejects; two stable budget failures reject; cold $0.0190 rejects and $0.0150 passes
      against $0.0376; inert caching rejects; mismatched prompt hash gives no verdict; all checks
      passing with three discordant cases gives `accept_provisional` with three listed. Add an
      abstention-veto test mirroring the grounding one.
- [x] 4.2 Add `evals/decide.ts` and `"eval:decide": "tsx evals/decide.ts"`. It reads three record
      files, re-grades all three in memory with `regradeRecord` against the current seed, corpus
      and cases, and gives `no_verdict` if any case refuses to re-grade. It then calls `decide` and
      prints the verdict, each reason, the cases to read with their answer text, McNemar, and cost
      (cold and measured, both as % of baseline). No API key is needed and nothing is written.
      Verify that `npm run eval:decide -- <B1> <B2> <B1>` (the baseline judged as its own
      candidate) prints a cost rejection (100% > 50%) and no veto. Add the command to
      `evals/README.md` with one paragraph on the rule, pointing to the spec.

## 5. Candidates (live, by hand)

- [x] 5.1 Smoke run of the first candidate:
      `npm run eval -- --cases 'budget-failing-*' --model claude-sonnet-5-5 --effort low --max-usd 0.25`.
      Verify in the record:
      (a) the first call of the first case reports cache-write tokens of about 2,400 or more;
      (b) every later call reports non-zero cache reads;
      (c) the record says `prompt_caching: true`.
      If (b) fails, find the varying byte in the prefix before going on (design.md, decision 2).
      Commit the record.
- [x] 5.2 Full run of `claude-sonnet-5-5` at effort `low`, with a cap of about 4× the smoke run's
      cost per question × 24, never above $1.5. Commit the record and run `npm run eval:decide`
      against B1 and B2. If the verdict is `accept_provisional`, read every listed case and record
      the reading in `evals/decision-log.md` (design.md, decision 4). A reading that finds a figure
      no tool produced turns the verdict into a reject; write that down.
- [x] 5.3 Only if 5.2 is rejected and its cost check passed: the same as 5.2 for effort `medium`.
      If 5.2 failed the cost check, `medium` (which thinks more) cannot pass it either. Record that
      in the decision log, skip 5.3 and 5.4, and go to 6.2. Either way, if no candidate is accepted,
      skip 5.4 and 6.1.
- [x] 5.4 Confirming run of the accepted configuration: a second full run with the same flags.
      `decide` must also accept it against B1 and B2, and its listed cases are read and recorded the
      same way. Verify the log shows two accepting verdicts for the same configuration before
      group 6 switches anything.
      **Skipped:** no candidate was accepted (evals/decision-log.md, "Outcome").

## 6. Ship and document

- [x] 6.1 Only with two accepting verdicts from 5.4: set `MODEL` and `EFFORT` in
      `src/lib/assistant/config.ts` to the accepted configuration, with a comment pointing to the
      decision log. Run `npm run dev` and ask one question in the chat ("¿qué cajas no cierran el
      presupuesto óptico?"). Verify the answer streams, the map highlights NAP-09 and NAP-12, and
      the server log line shows the new model and non-zero cache reads on the second call.
      **Skipped:** no candidate was accepted; the model stays `claude-opus-5`.
- [ ] 6.2 Replace the README's baseline section with the comparison table (proposal, What
      Changes). Include every configuration in this change:
      (a) the two baseline runs;
      (b) each candidate that ran, with median and p95 cost (cold and measured), p95 latency, pass
      rate with *n* and interval, McNemar against B1, and the verdict;
      (c) Opus 5.5 as "not run", with its 71% cold projection as the reason.
      Then the choice and why, and the honest limit (no non-inferiority at n = 21). Copy every
      figure from the stored summaries or from `eval:decide` output; compute none by hand. Verify
      each figure against its record by reading both.
- [ ] 6.3 Update the status section of `CLAUDE.md`: the new baseline figures, the model in use, the
      noise-floor result, and "Lo próximo: `add-subscriber-trace`". Verify that the README and
      `CLAUDE.md` state the same numbers.

## Workflow follow-up

- After review, archive the change. Phase 4 is still not deployable on its own.
- `add-subscriber-trace` builds on the configuration this change ships. Its eval cases are judged
  against this change's final records, not against the Opus 5 baseline.
