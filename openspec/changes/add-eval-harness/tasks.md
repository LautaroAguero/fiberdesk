# Tasks — eval harness

As in every phase so far, **no task in groups 1–8 may call the Anthropic API** — not from tests,
not from a script. Everything there is verified against `createFakeModelClient` fixtures, the seed
and the corpus. Group 9 is the only live work: the two baseline runs and the hand validation, done
by hand under a spend cap.

Every task ends green: `npm test`, `npm run lint` and `npx tsc --noEmit` pass before it is ticked.

## 1. Setup

- [x] 1.1 Install `tsx` as a dev dependency; add `"eval": "tsx --env-file-if-exists=.env.local evals/run.ts"`
      and `"eval:compare": "tsx evals/compare.ts"` to `package.json`; extend `eslint` and `tsconfig`
      coverage to `evals/` if they do not already reach it. Verify a two-line `evals/run.ts` stub that
      imports `@/lib/optical/constants` and prints `FIBER_DB_PER_KM` prints `0.25` under
      `npx tsx` (the path alias resolves), and `npm test` still passes with its existing count.
- [x] 1.2 Move `MODEL`, `MAX_TOKENS`, `EFFORT` from `src/app/api/chat/route.ts`, and the thinking
      setting from `loop.ts`, into `src/lib/assistant/config.ts` (design.md, decision 2), each with
      a comment; the route and the loop import them. Values unchanged. Verify the existing loop
      test asserting the request's `thinking` still passes and `grep -n "claude-opus-5" src/app` finds nothing.

## 2. Usage and cost per model call (`network-assistant`)

- [x] 2.1 Add `src/lib/assistant/pricing.ts`: per-model input, output, cache-write (5 min) and
      cache-read rates in USD per million tokens for `claude-opus-5`, `claude-opus-5-5`,
      `claude-sonnet-5-5`, with `PRICES_VERIFIED_ON`, the source, and each derived rate marked as
      derived (design.md, decision 4); and `computeCost(model, usage)`. Add `pricing.test.ts`:
      Opus 5, 2,000 in / 500 out → `0.0225`; Opus 5, 1,000 in / 3,000 cache-read / 200 out →
      `0.0115`; cache-write tokens priced at 6.25; `null` usage fields treated as 0; an unlisted
      model → `null`.
- [x] 2.2 Add `iteration` (1-based model call index) to `ToolCallRecord` in `loop.ts`. Extend
      `loop.test.ts`: a survey turn then a two-detail parallel turn yields iterations 1, 2, 2.
- [x] 2.3 Add `src/lib/assistant/usage.ts` with `withUsageMetering(client, onCall, clock?)` and
      `summarizeTurn(calls, toolCalls)` (design.md, decision 3). Add `usage.test.ts` with the fake
      client and an injected clock: one record per call with the served `message.model`, the four
      token counts, latency and cost; a three-call turn summarizes to 3 iterations, summed tokens
      and cost, and the trajectory `summarize_optical_budgets`@1, `detail_optical_budget`@2 ×2;
      when the second call throws, the first call's record was still emitted; an unpriced model
      yields `cost: null` and a summary whose cost is `null` with the model named.
- [x] 2.4 Wrap the client in `route.ts` with `withUsageMetering` and log one
      `console.info(JSON.stringify({ event: "assistant_turn", ... }))` line per turn with the
      summary and no message text. Verify by reading the diff that the SSE events and `done`
      payload are built exactly as before, and that `npm test` passes unchanged in count except for
      the tests added in 2.1–2.3.

## 3. Cases and their loader

- [x] 3.1 Add `src/lib/evals/types.ts` (case, expectation, grader result, outcome, run record) and
      `src/lib/evals/cases.ts` with `loadCases(dir, network)` (design.md, decision 6). Add
      `cases.test.ts` with temporary fixture files: a valid set loads; a duplicate id fails naming
      both files; an oracle id `NAP-13` fails naming the case; an unknown tool name, an unknown
      area, an empty `turns` and malformed JSON each fail naming the file.
- [x] 3.2 Add the oracle cross-check to `cases.test.ts`: every case in `evals/cases/` tagged
      `oracle: "non_passing"` lists exactly the NAPs not `pass` in `seed/expected-budgets.json`
      (today NAP-09 and NAP-12). It passes vacuously until group 8 writes the cases; verify it by
      temporarily pointing it at a fixture case listing only NAP-09 and seeing it fail.

## 4. Graders

- [x] 4.1 Add `src/lib/evals/numbers.ts`: extract numeric tokens from answer text (sign incl. `−`,
      `.` or `,` decimals, both readings of `1.650` / `1,650`), excluding identifiers, splitter
      ratios and line-start list markers; and collect source numbers from parsed tool results (JSON
      numbers at any depth), `search_result` text blocks, and user turns. Add `numbers.test.ts`:
      "NAP-09: margen −1,40 dB; NAP-12 2.77 dB, splitter 1:16" → [−1.40, 2.77]; "1. Primero" → [];
      "1.650 tokens" → one token with readings 1.65 and 1650; "FR-03" and "OLT-RES-01" → []; "1490 nm" → [1490].
- [x] 4.2 Add `src/lib/evals/graders/grounding.ts` (design.md, decision 8). Add tests for every
      grounding scenario in `specs/assistant-evals/spec.md`: exact Spanish-notation pass; 2.7 vs
      2.77 fails naming 2.7; 20.8 vs runs 12 and 8.8 fails naming 20.8; a user-supplied 4 passes;
      1.40 vs −1.40 passes with a `sign_only` entry; a figure from an earlier turn's tool result
      passes in a follow-up.
- [x] 4.3 Add `graders/trajectory.ts` (required, required-with-input-match, required-any,
      forbidden, ordered by iteration, non-empty search result) with tests: survey@1 then detail@2
      passes; detail@1 then survey@2 fails naming the order; both in one iteration fails an order
      constraint; `min_margin_db: 4` input match passes on 4 and fails on 3; a forbidden tool fails.
- [x] 4.4 Add `graders/highlight.ts` (`equals` / `contains` over payload ids), `graders/abstention.ts`
      (empty payload and grounding pass), `graders/figures.ts` and `graders/citation.ts`, each with
      tests from the spec's scenarios: {09, 12} equals passes; {06, 09, 12} fails naming NAP-06;
      ONT decline citing a tool-returned 28 passes; "−28 dBm" with no source fails; any payload
      entry on the NAP-13 case fails; 0.22 and 0.25 both required; a named returned source passes
      citation; a text block with `citations` passes; neither fails.

## 5. Statistics and comparison

- [x] 5.1 Add `src/lib/evals/stats.ts`: pass rate, 95% Wilson interval, median, nearest-rank p95
      (design.md, decision 12). Add `stats.test.ts`: 17/20 → 85.0%, 64.0%–94.8%; 68/80 →
      75.6%–91.2%; 0/5 and 5/5 stay within [0, 1]; costs 0.01…0.20 → median 0.105, p95 0.19;
      a single value is its own median and p95; empty input throws.
- [x] 5.2 Add `src/lib/evals/compare.ts` with `compareRuns(a, b)` (design.md, decision 13). Add
      `compare.test.ts`: one pass→fail and one fail→pass reported as 1 / 1 and named unstable; a
      case errored in one run and a case present in only one run are listed apart and excluded from
      the counts.

## 6. Runner orchestration

- [x] 6.1 Add `src/lib/evals/runner.ts` with `runEvalSuite({ cases, client, network, searchIndex,
      config, maxUsd, onProgress })`: runs cases sequentially, each turn through `runAssistantLoop`
      with the metered client, carrying the real message array into the next turn, grading only
      the final turn, and classifying `pass` / `fail` / `error` (API error or `truncated`) /
      `skipped_budget` (design.md, decisions 9–10). Add `runner.test.ts` with the fake client: a
      two-turn case sends the first turn's tool_use/tool_result blocks in the second request and
      grades only the second answer; a thrown client error yields `error` and an `incomplete` run;
      a refusal stop reason is graded, not an error.
- [x] 6.2 Add the spend cap and record assembly to `runner.ts`, with `promptHash(system, tools,
      settings)` (SHA-256 over canonical JSON). Tests: cap $1.00, $0.90 spent, max case $0.15 →
      the next case and all later ones are `skipped_budget`, run `partial`; an unpriced model stops
      the run after its case, naming the model; a missing or non-positive cap throws before any
      call; changing one character of the system prompt changes the hash; reordering object keys
      in the settings does not; the record holds per-case answer text, grader reasons, trajectory
      and per-call tokens, cost, latency, and the summary from `stats.ts`.

## 7. Entry points and documentation

- [ ] 7.1 Add `evals/run.ts`: parse `--max-usd` (required), `--cases`, `--model`, `--effort`;
      load network, corpus and cases; build the real client; call `runEvalSuite`; write
      `evals/runs/<UTC timestamp>.json`; print the summary table. Add `evals/compare.ts`: read two
      records, print `compareRuns`. Verify without spending: `npm run eval` with no `--max-usd`
      exits non-zero naming the cap, and with a cap but no `ANTHROPIC_API_KEY` exits non-zero naming
      the variable, both before any request; `npm run eval:compare` on two hand-made fixture records
      prints the expected flips.
- [ ] 7.2 Add `evals/README.md`: how to run, the cap, what each grader checks and does not check
      (membership, not attribution), where records go, how to compare two runs. Update the main
      README's "Tests never call the API" section to point to it, keeping the "no evals" sentence
      until group 9 replaces it with numbers. Verify the commands documented match `package.json`.

## 8. The baseline cases

- [ ] 8.1 Write `evals/cases/budget.json` and `evals/cases/docs.json` with the cases in design.md,
      decision 14, each with its `source` (the verification.md section it converts, or "new").
      Verify `loadCases` accepts them in a test and the oracle cross-check from 3.2 now checks
      `budget-failing-en` and `budget-failing-es` against the seed.
- [ ] 8.2 Write `evals/cases/abstention.json` and `evals/cases/conversation.json` likewise. Verify
      the loader accepts all four files: 21 cases, 4 areas, no duplicate ids.

## 9. Baseline runs (live, by hand)

- [ ] 9.1 First baseline run on the current configuration (`claude-opus-5`, effort `low`) with a
      cap of $10: `npm run eval -- --max-usd 10`. Verify the record is `complete` (no errors, no
      skips) and commit it. If it is not complete, fix the cause and re-run before continuing.
- [ ] 9.2 Validate the grounding grader by hand on at least 15 answers from that record (every area,
      every answer it flagged), number by number; write `evals/grader-validation.md` with flagged vs
      human-judged numbers, false positives and false negatives per answer. If any false positive is
      found, fix the grader (with a regression test reproducing it), re-grade the same answers
      offline from the committed record, and repeat until it records zero false positives.
- [ ] 9.3 Second baseline run, same configuration and cap; commit the record. Run
      `npm run eval:compare` on the two records and record the flip counts and the unstable cases.
- [ ] 9.4 Replace the README's "this project has no evals" paragraph with the baseline table — pass
      rate per area and overall with *n* and 95% Wilson interval, median and p95 cost per question,
      p95 latency, the noise floor between the two runs, the unstable cases, and the grader's known
      limits — every figure copied from a committed record's stored summary. Update `CLAUDE.md`'s
      status section to match. Verify each README figure against the record by reading both.

## Workflow follow-up

- After review, archive the change; note that it is the first item of Phase 4 and that Phase 4 is
  not yet deployable on its own.
- `reduce-cost-per-question` starts from the two committed baseline records and the noise floor
  recorded in 9.3.
