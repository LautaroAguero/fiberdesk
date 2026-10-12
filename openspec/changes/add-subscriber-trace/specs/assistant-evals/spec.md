## MODIFIED Requirements

### Requirement: The highlight grader compares against a hand-derived oracle

The highlight grader SHALL compare the set of NAPs and subscribers in the payload the server
projected for the graded turn with the case's oracle set, by exact equality unless the case
declares containment. Run entries SHALL NOT be compared: they only describe the paths of the NAPs
and subscribers that are compared. The oracle SHALL be written by hand in the case, never computed
by the engine under test.

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

#### Scenario: The oracle agrees with the committed expected budgets

- **WHEN** the unit tests run
- **THEN** every case whose oracle claims "the NAPs that do not pass" lists exactly the NAPs whose
  status in `seed/expected-budgets.json` is not `pass` — today NAP-09 (`fail`, −1.40 dB) and NAP-12
  (`marginal`, 2.77 dB)
