## ADDED Requirements

### Requirement: A case can carry a selected point

A case SHALL be able to declare a selected point on the map. The point SHALL be sent as the map
context of every turn of that case, the way the chat page sends it, through the same path the chat
route uses. A case without one SHALL run with no point selected. The loader SHALL reject a case
whose point lies outside the modelled city, naming the case. The run record SHALL keep each case's
point, so that the case can be re-graded.

#### Scenario: A point sent with every turn

- **WHEN** a case declares the point (-27.4659, -58.9700) and has two turns
- **THEN** both turns are sent with that point as the selected point

#### Scenario: No point declared

- **WHEN** a case declares no point and asks "¿puedo conectar un cliente acá?"
- **THEN** its turn is sent with no point selected

#### Scenario: A point outside the city

- **WHEN** a case declares the point (-34.6037, -58.3816)
- **THEN** loading fails, naming the case and saying the point is outside the modelled city

## MODIFIED Requirements

### Requirement: The highlight grader compares against a hand-derived oracle

The highlight grader SHALL compare the set of NAPs, subscribers, cut runs and candidates in the
payload the server projected for the graded turn with the case's oracle set, by exact equality
unless the case declares containment. A cut run is a run entry with status `cut`: it is the subject
of the answer. A candidate is compared by its NAP identifier. Every other run entry and the point
entry SHALL NOT be compared. Those runs only describe the path or the downstream set of the
compared entities, and the point is the case's own input. The oracle SHALL be written by hand in
the case, never computed by the engine under test.

#### Scenario: The reference question highlights exactly the two problem NAPs

- **WHEN** the oracle is `{NAP-09, NAP-12}` with exact equality and the projected payload holds
  NAP-09 and NAP-12 and the runs on their paths
- **THEN** the highlight grader passes

#### Scenario: An extra NAP fails exact equality

- **WHEN** the same oracle meets a payload holding NAP-06, NAP-09 and NAP-12
- **THEN** the highlight grader fails, naming NAP-06 as unexpected

#### Scenario: A traced subscriber is compared by its identifier

- **WHEN** the oracle is `{SUB-025}` with exact equality and the projected payload holds SUB-025
  and runs FR-03 and FR-12
- **THEN** the highlight grader passes

#### Scenario: A cut is compared by its element and what it takes out

- **WHEN** the oracle is `{FR-12, NAP-12, SUB-025, SUB-026, SUB-027, SUB-028}` with exact equality
  and the projected payload holds FR-12 as `cut` and the rest as `out_of_service`
- **THEN** the highlight grader passes

#### Scenario: A dark downstream run is not compared

- **WHEN** the oracle is `{FR-03, NAP-03, NAP-12, SUB-006, SUB-025, SUB-026, SUB-027, SUB-028}` and
  the payload also holds FR-12 as `out_of_service`
- **THEN** the highlight grader passes with exact equality, ignoring FR-12

#### Scenario: Candidates are compared, the point is not

- **WHEN** the oracle is `{NAP-03, NAP-08, NAP-12}` with exact equality and the projected payload
  holds the point and candidate entries for NAP-03, NAP-08 and NAP-12
- **THEN** the highlight grader passes

#### Scenario: The oracle agrees with the committed expected budgets

- **WHEN** the unit tests run
- **THEN** every case whose oracle claims "the NAPs that do not pass" lists exactly the NAPs whose
  status in `seed/expected-budgets.json` is not `pass` — today NAP-09 (`fail`, −1.40 dB) and NAP-12
  (`marginal`, 2.77 dB)

### Requirement: A recorded run can be re-graded without calling the model

The system SHALL re-grade a committed run record with the current graders and case expectations
without any model call, rebuilding each graded turn's tool results from the recorded tool calls
and the case's recorded point. It SHALL refuse to re-grade a case whose rebuilt results differ from
those the model saw.

#### Scenario: A grader fix costs nothing

- **WHEN** a case's expectations gain a required figure 99 that its recorded answer does not state
- **THEN** re-grading the record turns that case from pass to fail
- **AND** no request is sent to the model

#### Scenario: Results the model never saw are not graded

- **WHEN** a recorded tool result's hash no longer matches what the tool returns today
- **THEN** that case is not re-graded and the mismatch is reported, naming the case and the tool

#### Scenario: A feasibility result is rebuilt from the recorded point

- **WHEN** a recorded case evaluated the point (-27.4165, -59.0180)
- **THEN** re-grading rebuilds its connection-candidates result for that point, and the hashes
  match

#### Scenario: A record from before map context

- **WHEN** a run record written before this change is re-graded
- **THEN** its cases are rebuilt with no point selected and re-grade as before
