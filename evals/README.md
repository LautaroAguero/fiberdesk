# Evals

The live counterpart to `npm test`. The unit tests prove the deterministic parts — the optical
engine, the loop, the graders themselves — and never call the API. The evals ask the **real
model** the questions users ask, and check what it did with deterministic graders. They spend
money, so they run by hand, never in CI.

Spec: `openspec/changes/add-eval-harness/` (or `openspec/specs/assistant-evals/` once archived).

## Running

```bash
npm run eval -- --max-usd 10                    # every case, on the app's own model settings
npm run eval -- --max-usd 2 --cases 'budget-*'  # a subset, by case id
npm run eval -- --max-usd 10 --model claude-opus-5-5 --effort medium   # a candidate configuration
npm run eval:compare -- evals/runs/A.json evals/runs/B.json            # which cases flipped
```

- **`--max-usd` is required.** Before each case the runner stops if what it has spent plus the most
  expensive case so far would exceed the cap; the remaining cases are recorded as
  `skipped_budget`. A case already running is never cut short.
- **It needs `ANTHROPIC_API_KEY`**, read from the environment or `.env.local`, like the app.
- **Without `--model` / `--effort` it runs exactly what the chat route runs**: both read
  `src/lib/assistant/config.ts`. An override is recorded in the run record.
- A call served by a model missing from `src/lib/assistant/pricing.ts` stops the run after that
  case — its cost is unknown, so the cap can no longer be enforced.

## Cases

`evals/cases/<area>.json`, one array per area. Each case has an `id`, an `area`, the `source` it
converts (a `verification.md` section, or `new`), one or more user `turns`, and the graders it
declares under `expect`. Multi-turn cases run every turn live, carrying the real conversation
forward; only the last answer is graded.

The loader rejects the whole set — naming the file, the case and the problem — if anything is
malformed: a duplicate id, an unknown tool or area, a highlight oracle naming an entity the network
does not contain.

## Graders

All deterministic. No LLM judge.

| Grader | Passes when | Does **not** check |
|---|---|---|
| `trajectory` | required tools were called (optionally with given inputs, or returning a non-empty result), forbidden ones were not, and ordered pairs ran in strictly earlier model iterations | whether the inputs were the best ones beyond those pinned |
| `highlight` | the entities the server projected equal (or contain) a hand-written oracle set | anything when the answer came from the survey alone — the payload only carries detailed NAPs |
| `grounding` | every number in the answer equals a number in a tool result visible in the conversation, or in the user's own messages | **attribution**: a real number attached to the wrong NAP passes |
| `abstention` | nothing is highlighted and grounding passes | whether the prose actually declines |
| `figures` | each required figure appears in the answer | where it appears |
| `citation` | the answer carries a native citation, or names a document the search returned this turn | whether the citation supports the sentence it sits on |

How grounding reads numbers: `29,40` and `29.40` are the same figure; `1.650` is accepted if either
1.65 or 1650 is grounded; identifiers (`NAP-12`, `OLT-RES-01`), splitter ratios (`1:16`) and
line-start list markers are not figures; wavelengths (`1490`) are. A figure that matches a source
only by absolute value ("1.40 dB short" for −1.40) passes but is listed under `sign_only` for a
person to read. Small integers are its blind spot: `2`, `3` or `12` appear somewhere in almost any
result.

The grounding grader is not trusted until it has been checked by hand against real answers — see
`grader-validation.md`.

A case passes only if every grader it declares passes. A model error after the SDK's retries, or a
loop that hits its iteration cap, is an `error`: excluded from pass rates, counted beside them, and
it marks the run `incomplete`.

## Run records

`evals/runs/<UTC start time>.json`, committed. Each holds the model and effort, a SHA-256
`prompt_hash` of the system prompt, tool definitions and request settings, the cap and the spend,
and per case: the outcome, each grader's result and reasons, the answer text, the tool trajectory,
and per model call the tokens, cost and latency. A failing case can be read from the record
without paying to re-run it.

The summary — pass rate per area with a 95% Wilson interval, median and 95th-percentile cost and
latency per question (per user turn) — is computed in `src/lib/evals/stats.ts`, never by a model.
`eval:compare` pairs two records by case id and names every case that flipped; over two runs of
the same configuration, that is the noise floor.
