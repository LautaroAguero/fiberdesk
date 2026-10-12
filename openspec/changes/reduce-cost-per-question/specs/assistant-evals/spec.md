## ADDED Requirements

### Requirement: A cheaper configuration is accepted only by a rule fixed in advance

The system SHALL decide whether a candidate configuration may replace the baseline from three
committed run records — the baseline run, a second run of the baseline configuration, and the
candidate run — by deterministic code, with no model call. The rule SHALL be fixed before any
candidate is run and SHALL NOT be changed after seeing a candidate's results.

A case is **stable** when it passes in both baseline runs. A grader is **stable on a case** when it
passes on that case in both baseline runs. The candidate SHALL be rejected when any of these holds:

- **Veto:** on some case, the grounding or the abstention grader is stable and fails in the
  candidate. These graders encode the project's hard rules: a cheaper configuration that invents a
  number is broken, not cheaper.
- **Net loss:** the candidate passes fewer than the lower of the two baseline pass counts minus
  one (one case is 4.8 points of 21).
- **Concentrated loss:** two or more stable cases of the same area fail in the candidate.
- **Cost:** the candidate's median cold cost per question is above 50% of the baseline run's.
- **Inert caching:** the candidate ran with prompt caching on and recorded no cache reads at all.

The output SHALL list every case whose outcome in the candidate differs from either baseline run.
A verdict of accept SHALL be reported as provisional until a person has read each listed case
and recorded the reading. A reading that finds a figure the model produced rather than a tool
SHALL reject the candidate. The exact McNemar test against the baseline run SHALL be reported
beside the verdict and SHALL NOT decide it.

When the rule cannot be applied — a record that is partial or has errored cases, or two baseline
records that differ in model, effort or prompt hash — the system SHALL say which and why, and
SHALL give no verdict rather than a guessed one.

#### Scenario: A stable grounding regression vetoes a candidate that passes more cases

- **WHEN** grounding passes on `budget-detail-nap07` in both baseline runs and fails on it in the
  candidate, and the candidate passes 18 cases against the baseline's 16
- **THEN** the candidate is rejected, naming `budget-detail-nap07` and the grounding grader

#### Scenario: An unstable grader does not veto

- **WHEN** grounding passes on `docs-rain-es` in the baseline run, fails on it in the second
  baseline run, and fails on it in the candidate
- **THEN** that case triggers no veto
- **AND** it is still listed for reading

#### Scenario: Net loss of one case is tolerated, of two is not

- **WHEN** the baseline runs pass 16 and 15 cases and the candidate passes 14
- **THEN** the net-loss check passes (14 ≥ 15 − 1)
- **AND WHEN** the candidate passes 13
- **THEN** the candidate is rejected for net loss

#### Scenario: Two new failures in one area

- **WHEN** two cases of the `budget` area that pass in both baseline runs fail in the candidate
- **THEN** the candidate is rejected for concentrated loss, naming the area and both cases

#### Scenario: The cost target is judged on cold cost

- **WHEN** the baseline run's median cold cost per question is $0.0376
- **THEN** a candidate at a median cold cost of $0.0190 is rejected on cost
- **AND** a candidate at $0.0150 passes the cost check, whatever its measured (warm) median

#### Scenario: Caching that never hits is a bug, not a result

- **WHEN** a candidate record states prompt caching was on and every call reports zero cache-read
  tokens
- **THEN** the candidate is rejected as inert caching

#### Scenario: Mismatched baselines give no verdict

- **WHEN** the second baseline run carries a different prompt hash from the first
- **THEN** no verdict is given and the output names the mismatch

#### Scenario: Acceptance waits for the reading

- **WHEN** every automatic check passes and three cases differ between the candidate and a
  baseline run
- **THEN** the verdict is "accept, provisional" with those three cases listed for reading

## MODIFIED Requirements

### Requirement: The eval exercises the assistant the app serves

The eval SHALL drive the same loop, system prompt, tool definitions, model, effort, token limit and
prompt caching setting that the chat route uses, read from a single shared source, so that a
measured result describes what users get.

#### Scenario: Model settings cannot drift

- **WHEN** the chat route's model is changed
- **THEN** the next eval run uses and records the new model without any change to the eval code

#### Scenario: Caching cannot drift

- **WHEN** prompt caching is turned on for the chat route
- **THEN** the next eval run sends the same cache markers and records that caching was on

### Requirement: Every run leaves a committed record

Each run SHALL write a record that includes the date, the model, whether prompt caching was on, a
hash of the system prompt and tool definitions, the cap and the amount spent, and per case: the
outcome of each grader, the final answer text, the tool trajectory, and per call tokens, cost and
latency.

#### Scenario: Two runs are distinguishable by configuration

- **WHEN** the system prompt changes by one character between two runs
- **THEN** the two records carry different prompt hashes

#### Scenario: A discordant case can be read without re-running it

- **WHEN** a case fails in a run
- **THEN** its record holds the final answer text and each grader's reason, enough for a person to
  judge the failure without calling the API

#### Scenario: Records written before caching existed

- **WHEN** a record written before this requirement has no caching field
- **THEN** it is read as a run with caching off

### Requirement: Summary statistics are computed in code

The run summary SHALL report, per area and overall, the pass rate with its count and a 95% Wilson
interval, and per question the median and 95th-percentile cost, both as measured and cold, and the
95th-percentile latency. The **cold** cost of a question SHALL be its measured cost with the
cache-read tokens of its first model call re-priced at the cache-write rate of the model that
served it — the cost had no earlier question warmed the prompt cache. All of these SHALL be computed
by deterministic code from the recorded usage and the pricing table; no figure in the summary SHALL
come from a model. When a question's cold cost cannot be priced (an unpriced model), it SHALL be
reported as unknown, never estimated.

#### Scenario: Wilson interval

- **WHEN** an area has 17 passes out of 20 completed cases
- **THEN** the summary reports 85.0% with a 95% interval of 64.0%–94.8%

#### Scenario: Median and 95th percentile

- **WHEN** the per-question costs are the twenty values $0.01, $0.02, …, $0.20
- **THEN** the median is $0.105 (the mean of the two middle values)
- **AND** the 95th percentile is $0.19 (nearest rank: the 19th of 20 sorted values)

#### Scenario: Cold cost re-prices the first call's cache reads

- **WHEN** a question served by `claude-sonnet-5-5` (cache read $0.20, cache write $2.50 per
  million) cost $0.0100 as measured, and its first call read 2,400 tokens from cache
- **THEN** its cold cost is $0.01552 ($0.0100 + 2,400 × ($2.50 − $0.20) / 1M)

#### Scenario: Without caching, cold equals measured

- **WHEN** no call of a run read from the cache
- **THEN** every question's cold cost equals its measured cost

#### Scenario: Reads after the first call are kept

- **WHEN** the second call of a question reads 3,000 tokens from cache written by its first call
- **THEN** those reads stay at the cache-read rate in the cold cost

### Requirement: Two runs can be compared case by case

The system SHALL compare two run records and list every case whose pass/fail outcome differs, with
the count in each direction, and the two-sided exact McNemar p-value over those counts. Cases
skipped or errored in either run SHALL be listed apart and excluded from the counts.

#### Scenario: Noise between two runs of the same configuration

- **WHEN** two runs of the same configuration differ on `budget-limit-es` (pass, then
  fail) and `docs-rain-es` (fail, then pass)
- **THEN** the comparison reports 1 case pass→fail and 1 case fail→pass, naming both as unstable

#### Scenario: Exact McNemar on few discordant cases

- **WHEN** 5 cases go pass→fail and 1 goes fail→pass
- **THEN** the reported p-value is 0.21875 (twice the probability of 1 or fewer in 6 fair coin
  flips)

#### Scenario: Exact McNemar reaching significance

- **WHEN** 10 cases go pass→fail and 2 go fail→pass
- **THEN** the reported p-value is 0.0386 (to four decimals)

#### Scenario: No discordant cases

- **WHEN** no case flips
- **THEN** the reported p-value is 1
