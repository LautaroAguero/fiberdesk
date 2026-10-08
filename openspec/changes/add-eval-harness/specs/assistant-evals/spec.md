# Spec Delta

## Purpose

Measures the assistant's live behaviour against the real model with repeatable, deterministic
graders, so that a change to the prompt, the tools or the model can be judged against a recorded
baseline instead of a single hand check.

## ADDED Requirements

### Requirement: The eval suite runs apart from the unit tests

The system SHALL provide an eval command that calls the live model, separate from the unit test
command. The unit test command SHALL NOT call the API, including the tests of the eval code
itself, which SHALL run against recorded fixtures.

#### Scenario: Unit tests stay offline

- **WHEN** `npm test` runs with no `ANTHROPIC_API_KEY` set
- **THEN** every test, including those covering the graders and the runner, completes without a
  network call to the model

#### Scenario: The eval command is explicit

- **WHEN** `npm run eval` is invoked
- **THEN** the live model is called, case by case
- **AND** nothing in `npm test` invokes it

### Requirement: The eval exercises the assistant the app serves

The eval SHALL drive the same loop, system prompt, tool definitions, model, effort and token limit
that the chat route uses, read from a single shared source, so that a measured result describes
what users get.

#### Scenario: Model settings cannot drift

- **WHEN** the chat route's model is changed
- **THEN** the next eval run uses and records the new model without any change to the eval code

### Requirement: A spend cap is mandatory

The eval command SHALL refuse to start without a spend cap in US dollars. Before each case it SHALL
stop if the money already spent plus the most expensive case so far would exceed the cap, and
record the remaining cases as skipped for budget.

#### Scenario: No cap, no run

- **WHEN** `npm run eval` is invoked without a cap
- **THEN** it exits with an error naming the missing cap
- **AND** no model call is made

#### Scenario: The cap stops the run before it is exceeded

- **WHEN** the cap is $1.00, $0.90 has been spent, and the most expensive case so far cost $0.15
- **THEN** the next case does not start
- **AND** it and every case after it are recorded as `skipped_budget`
- **AND** the run record is still written, marked as partial

#### Scenario: An unpriced model stops the run

- **WHEN** a model call is served by a model absent from the pricing table, so its cost is unknown
- **THEN** the run stops after that case, because the cap can no longer be enforced
- **AND** the run record names the unpriced model

### Requirement: Cases are data, validated on load

Eval cases SHALL live as files on disk, each with an identifier, an area, one or more user turns,
and the expectations its graders check. The loader SHALL reject an invalid case set with an error
naming the file, the case and what is wrong, rather than skipping it.

#### Scenario: A duplicate identifier

- **WHEN** two cases share the identifier `budget-failing-es`
- **THEN** loading fails, naming both files and the identifier

#### Scenario: An oracle naming an entity the network lacks

- **WHEN** a case's highlight oracle lists `NAP-13`, which the network does not contain
- **THEN** loading fails, naming the case and `NAP-13`

### Requirement: Multi-turn cases run every turn live

A case with several user turns SHALL send each turn to the model in order, carrying forward the
real conversation the previous turns produced. The graders SHALL judge the final turn; every turn's
usage SHALL be recorded.

#### Scenario: A follow-up builds on a live first turn

- **WHEN** a case's turns are "¿qué cajas no cierran el presupuesto óptico?" then "¿y la NAP-12?"
- **THEN** the second request carries the first turn's tool calls and results as the model actually
  produced them
- **AND** the graders judge only the answer to "¿y la NAP-12?"

### Requirement: The trajectory grader checks which tools ran and in what order

The trajectory grader SHALL check that the tools a case requires were called, that tools it forbids
were not, and, where a case declares an order, that the first call of one tool happened in an
earlier model iteration than the first call of another.

#### Scenario: Survey before detail passes

- **WHEN** a turn calls `summarize_optical_budgets` in iteration 1 and `detail_optical_budget` for
  NAP-09 and NAP-12 in iteration 2
- **THEN** a case requiring both, with the survey before the detail, passes the trajectory grader

#### Scenario: Detail without a prior survey fails

- **WHEN** a turn calls `detail_optical_budget` in iteration 1 and `summarize_optical_budgets` in
  iteration 2
- **THEN** the same case fails the trajectory grader, naming the violated order

### Requirement: The highlight grader compares against a hand-derived oracle

The highlight grader SHALL compare the set of entities in the payload the server projected for the
graded turn with the case's oracle set, by exact equality unless the case declares containment. The
oracle SHALL be written by hand in the case, never computed by the engine under test.

#### Scenario: The reference question highlights exactly the two problem NAPs

- **WHEN** the oracle is `{NAP-09, NAP-12}` with exact equality and the projected payload holds
  NAP-09 and NAP-12
- **THEN** the highlight grader passes

#### Scenario: An extra NAP fails exact equality

- **WHEN** the same oracle meets a payload holding NAP-06, NAP-09 and NAP-12
- **THEN** the highlight grader fails, naming NAP-06 as unexpected

#### Scenario: The oracle agrees with the committed expected budgets

- **WHEN** the unit tests run
- **THEN** every case whose oracle claims "the NAPs that do not pass" lists exactly the NAPs whose
  status in `seed/expected-budgets.json` is not `pass` — today NAP-09 (`fail`, −1.40 dB) and NAP-12
  (`marginal`, 2.77 dB)

### Requirement: The grounding grader checks every number against the tool results

The grounding grader SHALL extract every number from the graded answer and pass only if each one
equals a number present in a tool result visible in the conversation or in the user's own messages.
A number found in no source SHALL be reported as ungrounded; the grader never assumes it is right.

#### Scenario: Figures reproduced exactly, in Spanish notation

- **WHEN** the answer reads "NAP-09: margen −1,40 dB; NAP-12: margen 2.77 dB, splitter 1:16" and
  the tool results contain −1.4 and 2.77
- **THEN** the grounding grader passes
- **AND** `09`, `12` and `1:16` are not treated as figures, being part of an identifier or a ratio

#### Scenario: A rounded figure is ungrounded

- **WHEN** the answer reads "margen de 2,7 dB" and the tool results contain 2.77 but not 2.7
- **THEN** the grounding grader fails, reporting 2.7 as ungrounded

#### Scenario: A sum the model computed is ungrounded

- **WHEN** the answer reads "over 20.8 km of fiber" and the tool results contain run lengths 12 and
  8.8 but not 20.8
- **THEN** the grounding grader fails, reporting 20.8 — a figure the model computed rather than
  reproduced

#### Scenario: A number the user supplied

- **WHEN** the user asks "¿qué cajas quedan por debajo de 4 dB de margen?" and the answer repeats 4
- **THEN** 4 counts as grounded

#### Scenario: A sign-only match is a warning, not a pass

- **WHEN** the answer states 1.40 and the tool results contain −1.40 but not 1.40
- **THEN** the grader passes but records 1.40 as a sign-only match, listed in the run record for a
  human to read

### Requirement: The abstention grader checks that a declined question invents nothing

For a case that should be declined — a value the project does not model, an entity the network
lacks, a question outside the domain, a topic the documentation does not cover — the abstention
grader SHALL pass only if the projected highlight is empty and the answer contains no ungrounded
number.

#### Scenario: ONT sensitivity is declined

- **WHEN** the user asks "¿cuál es la sensibilidad del receptor de la ONT?" and the answer says the
  value is not available, citing only the 28 dB class budget the tools returned
- **THEN** the abstention grader passes

#### Scenario: An invented sensitivity fails

- **WHEN** the answer to the same question states "−28 dBm" and no tool result contains −28
- **THEN** the abstention grader fails, reporting −28 as ungrounded

#### Scenario: A non-existent NAP is not highlighted

- **WHEN** the user asks for the margin of NAP-13 and the projected highlight holds any entry
- **THEN** the abstention grader fails

### Requirement: Content graders check required figures and cited sources

A case MAY require figures that must appear in the answer, and MAY require that the answer cites a
documentation source. The figures grader SHALL pass only if each required figure appears; the
citation grader SHALL pass only if the answer carries a citation or names a source returned by the
search tool in that turn.

#### Scenario: The attenuation contradiction surfaces both values

- **WHEN** the user asks which fiber attenuation at 1490 nm to assume and the case requires 0.22 and
  0.25
- **THEN** the figures grader passes only if both values appear in the answer

#### Scenario: A documentation answer names its source

- **WHEN** the search tool returned passages from `splitters-and-cascades.md` and the answer names
  that document
- **THEN** the citation grader passes

#### Scenario: An answer with no source fails

- **WHEN** the search tool returned passages but the answer neither carries a citation nor names
  any returned source
- **THEN** the citation grader fails

### Requirement: A case's outcome is pass, fail, or error

A case SHALL pass only if every grader it declares passes. A case whose model call fails after the
client's retries SHALL be recorded as `error`, with the message, and SHALL be counted neither as a
pass nor as a fail; a run containing errors SHALL be marked incomplete.

#### Scenario: One failing grader fails the case

- **WHEN** a case passes trajectory and highlight but fails grounding
- **THEN** the case is recorded as failed, with each grader's own result kept

#### Scenario: An API failure is not a quality failure

- **WHEN** the API returns an error on a case after retries
- **THEN** the case is recorded as `error`
- **AND** the area's pass rate is computed over the cases that completed, with the error count
  reported beside it

### Requirement: Every run leaves a committed record

Each run SHALL write a record that includes the date, the model, a hash of the system prompt and
tool definitions, the cap and the amount spent, and per case: the outcome of each grader, the final
answer text, the tool trajectory, and per call tokens, cost and latency.

#### Scenario: Two runs are distinguishable by configuration

- **WHEN** the system prompt changes by one character between two runs
- **THEN** the two records carry different prompt hashes

#### Scenario: A discordant case can be read without re-running it

- **WHEN** a case fails in a run
- **THEN** its record holds the final answer text and each grader's reason, enough for a person to
  judge the failure without calling the API

### Requirement: Summary statistics are computed in code

The run summary SHALL report, per area and overall, the pass rate with its count and a 95% Wilson
interval, and per question the median and 95th-percentile cost and the 95th-percentile latency. All
of these SHALL be computed by deterministic code; no figure in the summary SHALL come from a model.

#### Scenario: Wilson interval

- **WHEN** an area has 17 passes out of 20 completed cases
- **THEN** the summary reports 85.0% with a 95% interval of 64.0%–94.8%

#### Scenario: Median and 95th percentile

- **WHEN** the per-question costs are the twenty values $0.01, $0.02, …, $0.20
- **THEN** the median is $0.105 (the mean of the two middle values)
- **AND** the 95th percentile is $0.19 (nearest rank: the 19th of 20 sorted values)

### Requirement: Two runs can be compared case by case

The system SHALL compare two run records and list every case whose pass/fail outcome differs, with
the count in each direction. Cases skipped or errored in either run SHALL be listed apart and
excluded from the counts.

#### Scenario: Noise between two runs of the same configuration

- **WHEN** two baseline runs of the same configuration differ on `budget-marginal-es` (pass, then
  fail) and `docs-rain-es` (fail, then pass)
- **THEN** the comparison reports 1 case pass→fail and 1 case fail→pass, naming both as unstable

### Requirement: The grounding grader is validated by hand before it is trusted

Before the grounding grader's result is used to accept or reject a configuration, its verdicts on
at least 15 real answers SHALL be checked by a person number by number, and the false positives and
false negatives found SHALL be recorded alongside the eval.

#### Scenario: A false positive blocks trust

- **WHEN** hand validation finds the grader flagged a number that does appear in a tool result
- **THEN** the grader is fixed and the validation repeated before any later change relies on it
