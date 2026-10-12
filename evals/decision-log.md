# Decision log — reduce-cost-per-question

The record of every judgment made in the OpenSpec change `reduce-cost-per-question`
(`openspec/changes/reduce-cost-per-question/`, design.md decisions 1 and 4). It holds the noise
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
