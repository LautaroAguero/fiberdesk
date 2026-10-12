# Decision log — reduce-cost-per-question

The record of every judgment made in the OpenSpec change `reduce-cost-per-question`
(`openspec/changes/archive/2026-10-12-reduce-cost-per-question/`, design.md decisions 1 and 4). It holds the noise
floor between two runs of the baseline configuration, and, for each candidate run, the
`eval:decide` verdict and the hand reading of every case it lists. Figures are copied from the
records and the tool output, never computed by hand.

- **B1** — `evals/runs/2026-10-08T03-32-06Z.regraded.json`, the published baseline.
- **B2** — `evals/runs/2026-10-12T11-08-31Z.regraded.json`, the second run of the same
  configuration.

## Noise floor: B1 vs B2

Both runs: `claude-opus-5`, effort `low`, prompt hash `fa57f136375a…`, status `complete`, prompt
caching off.

B2 ran at `8bbe911`. Between B1's commit (`1b717d2`) and that one, nothing changed in
`src/lib/assistant` or `src/app`. The only changes under `src/` are in the graders (the
tool-definition grounding source, add-eval-harness), which do not touch the request. The equal
prompt hash confirms that the model read the same prefix. Both records are compared after the
offline re-grade, so both are judged by the same graders.

| | B1 | B2 |
|---|---|---|
| Passed | 16/21 | 17/21 |
| Cost per question, median | $0.0376 | $0.0361 |
| Cost per question, p95 | $0.0663 | $0.0653 |
| Latency p95 | 13.1 s | 15.6 s |
| Spent | $1.03 | $0.99 |

`npm run eval:compare -- B1 B2`: 21 cases compared, pass → fail 0, fail → pass 1.

### Unstable cases (outcome flips between B1 and B2)

- `conv-and-nap12-es` (conversation) — fail in B1, pass in B2. The grounding grader flips: B1
  states an ungrounded `0.23`; B2 states none. The figures grader passes in both.

### Stable cases (pass in both)

16 cases:

- abstention: `abstain-ont-en`, `abstain-ont-es`, `abstain-nap13-es`, `abstain-vendor-es`,
  `abstain-docs-gap-en`
- budget: `budget-failing-es`, `budget-limit-es`, `budget-detail-nap07`, `budget-margin-4db-es`,
  `budget-nap01-ok-es`
- conversation: `conv-ont-after-budget-es`
- docs: `docs-cascade-en`, `docs-rain-es`, `docs-attenuation-en`, `docs-attenuation-es`,
  `docs-connector-es`

### Fail in both

- `budget-failing-en` — trajectory and highlight fail (stays at the survey); grounding passes.
- `budget-why-nap12-es` — grounding fails (ungrounded `20`); trajectory, highlight and figures pass.
- `budget-rx-nap09-es` — trajectory, highlight and figures fail; grounding passes.
- `conv-second-one-en` — grounding fails (ungrounded `19.8` in B1; `11` and `20` in B2); figures
  passes.

### Per-grader stability

A grader is stable on a case when it passes there in both runs. These are the graders the veto
watches (spec: grounding and abstention):

- **Abstention: stable on all 6 cases that carry it** — the five abstention cases and
  `conv-ont-after-budget-es`.
- **Grounding: stable on 12 cases** — `budget-failing-en`, `budget-failing-es`, `budget-limit-es`,
  `budget-detail-nap07`, `budget-rx-nap09-es`, `budget-margin-4db-es`, `budget-nap01-ok-es`,
  `docs-cascade-en`, `docs-rain-es`, `docs-attenuation-en`, `docs-attenuation-es`,
  `docs-connector-es`.
- Grounding is **unstable** on `conv-and-nap12-es` and fails in both on `budget-why-nap12-es` and
  `conv-second-one-en`. None of the three can veto a candidate.

Every other grader is either stable or fails in both runs; none flips. The flipping grader is
grounding, which matches the baseline's known weakness: arithmetic done in prose.

### Reading

One flip in 21 is well inside the design's threshold (more than 4 would make the eval too noisy to
mean much). The net-loss bar for a candidate is min(16, 17) − 1 = **15 passes**.

## Candidate 1: `claude-sonnet-5-5`, effort `low`, caching on (task 5.2)

Record: `evals/runs/2026-10-12T11-33-18Z.json`. Status `complete`, $0.1561 spent under a $0.85 cap,
prompt hash `fa57f136375a…` (same as B1 and B2). Smoke run before it (task 5.1):
`evals/runs/2026-10-12T11-32-46Z.json` — the first call wrote 2,457 cache tokens and every later
call read (2,457 / 2,372 / 2,465).

`npm run eval:decide -- B1 B2 <candidate>`:

- **Verdict: reject — veto.** The grounding grader is stable on `budget-failing-en` and
  `budget-failing-es` (it passes in both baseline runs) and fails on both in the candidate.
- Net loss: pass (17 against a floor of 15). Concentrated loss: pass. Inert caching: pass.
- Cost: pass. Cold median $0.0103 is 27.4% of B1's $0.0376 (limit $0.0188). Measured median is
  $0.0046, 12.4%.
- McNemar against B1 (context only): pass → fail 1, fail → pass 2, p = 1.0000.

### Reading

The verdict is a reject, so no reading can turn it into an accept. The readings are recorded
because they decide whether the veto reflects a real regression or a flaw in the rule.

- `budget-failing-en` (listed as a veto case; fail in all three runs). The flagged figure is the 9
  in "Los otros 9 NAPs pasan con holgura": 12 − 3, a subtraction the model did. B1 and B2 wrote
  "All other NAPs pass" and stated no count. Separately, **this answer is in Spanish for a
  question asked in English**, which no grader checks. That is a regression from both baselines.
- `budget-failing-es` (pass, pass → fail). The flagged figure is the 12 in "De las 12 cajas",
  which comes from counting the survey's rows. No tool states it. B2 also wrote "las 12 NAPs" and
  its grounding passed, but only because that turn also called the detail tool, whose result
  happens to contain a 12 (NAP-12, FR-12). That is the documented "membership, not attribution"
  limit of the grader, not a grounded count. The candidate also stops at the survey, so the
  trajectory and highlight graders fail too.
- `budget-rx-nap09-es` (fail, fail → pass). Every figure is in the NAP-09 detail result:
  −26.4 dBm, 29.4 / −1.4 dB, the four by-source losses, two 1:8 splitters of 10.5 dB, 12 km and
  8.8 km. No figure was produced by the model.
- `conv-and-nap12-es` (fail, pass → pass). The figures all come from the NAP-12 detail result. One
  ratio is written in words: "unas dos terceras partes de la pérdida total" (17 / 25.23). That is
  arithmetic, but in words, which the grader cannot see (grader-validation.md, "Counts written as
  words").

**Does the veto reflect a flaw in the rule?** No. Both vetoes catch a number the model derived,
by subtraction or by counting rows, which is the bug `CLAUDE.md` names. The baselines avoided the
digits rather than the behaviour: B1 and B2 wrote counts in words or not at all. The rule stands.

**Next:** the cost check passed, so task 5.3 runs effort `medium`.

## Candidate 2: `claude-sonnet-5-5`, effort `medium`, caching on (task 5.3)

Record: `evals/runs/2026-10-12T11-36-14Z.json`. Status `complete`, $0.1629 spent under a $0.85 cap.
Its prompt hash is `267254a35afb…`, not B1's, because effort is one of the hashed request
settings. Only the two baselines must match each other, and they do.

`npm run eval:decide -- B1 B2 <candidate>`:

- **Verdict: reject — veto.** The grounding grader is stable and fails in the candidate on three
  cases: `budget-failing-en`, `budget-failing-es` and `docs-attenuation-en`.
- Net loss: pass, but only just (15 against a floor of 15). Concentrated loss: pass. Inert
  caching: pass.
- Cost: pass. Cold median $0.0121 is 32.1% of B1's $0.0376. Measured median is $0.0064, 17.0%.
- McNemar against B1 (context only): pass → fail 2, fail → pass 1, p = 1.0000.

### Reading

- `budget-failing-en` (veto). "The other 9 NAPs pass": 12 − 3 again, after a survey-only turn.
  The answer is in English this time.
- `budget-failing-es` (pass, pass → fail; veto). "De las 12 cajas" and "Las otras 9 cajas": a row
  count and a subtraction. The turn stops at the survey.
- `docs-attenuation-en` (pass, pass → fail; veto). "The two figures disagree by 0.03 dB/km":
  0.25 − 0.22, subtracted by the model. Otherwise the answer is what the case wants: it names both
  values, attributes each one, and says which one the budgets use.
- `budget-rx-nap09-es` (fail, fail → pass). Every figure is in the NAP-09 detail result.
- `conv-and-nap12-es` (fail, pass → fail). "habría que recuperar 0.23 dB": 3.00 − 2.77, the same
  subtraction B1 made.

The vetoes are the same behaviour as at effort `low`, and more of it. Medium effort does not stop
the model doing arithmetic in prose.

## Outcome

No candidate is accepted. Under the rule fixed before the runs, neither Sonnet 5.5 configuration
can replace Opus 5:

| Configuration | Passes | Cold median | % of B1 | Verdict |
|---|---|---|---|---|
| `claude-sonnet-5-5`, `low` | 17/21 | $0.0103 | 27.4% | reject (veto: 2 cases) |
| `claude-sonnet-5-5`, `medium` | 15/21 | $0.0121 | 32.1% | reject (veto: 3 cases) |

Both pass the cost target with room to spare. Both fail on the project's hardest rule: no number
may come from the model. Following tasks 5.3 and 5.4, the confirming run (5.4) and the model switch
(6.1) are skipped. The assistant stays on `claude-opus-5` at effort `low`. Prompt caching ships
anyway (design.md, decision 8).

The failures are prompt work, not model choice. Every veto is a count or a difference written as
digits after a tool call. That is the baseline's own known weakness, made more frequent. Fixing it
is a separate change with its own runs (proposal, non-goals). After that change, both Sonnet
configurations can be judged again from new runs under the same rule.
