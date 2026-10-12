## Purpose

Computes what a cut of one fiber run or one NAP takes out of service downstream — every NAP,
subscriber and fiber run below it, through splitter cascades — together with the counts, so that
an answer about an outage never depends on a model counting a list.

## Requirements

### Requirement: A cut takes out everything downstream of it

Given one fiber run or one NAP, the system SHALL return every NAP, every subscriber and every fiber
run that loses service when that element is cut. A NAP SHALL count as out of service when it, or
any NAP above it on its path to the OLT, is cut or sits at the far end of the cut run. Every NAP
cascaded below an out-of-service NAP SHALL be out of service too. A subscriber SHALL be out of
service when its serving NAP is. A fiber run SHALL be out of service when its upstream end is an
out-of-service NAP. Elements upstream of the cut SHALL be unaffected.

The result SHALL name the cut element and its kind. It SHALL list the out-of-service NAPs,
subscribers and runs, each sorted by identifier, and SHALL report the count of each. The counts
SHALL be computed by deterministic code. The same network and element SHALL always give the same
result.

#### Scenario: A feeder cut through a cascade

- **WHEN** the impact of cutting FR-03 is computed
- **THEN** the NAPs out of service are NAP-03 and NAP-12
- **AND** the subscribers out of service are SUB-006, SUB-025, SUB-026, SUB-027 and SUB-028, a
  count of 5
- **AND** the runs out of service downstream are FR-12

#### Scenario: A leaf run cut

- **WHEN** the impact of cutting FR-12 is computed
- **THEN** the only NAP out of service is NAP-12
- **AND** the subscribers out of service are SUB-025 to SUB-028, a count of 4
- **AND** no run downstream goes dark, and NAP-03 and SUB-006 keep service

#### Scenario: Another cascade

- **WHEN** the impact of cutting FR-04 is computed
- **THEN** the NAPs out of service are NAP-04 and NAP-09
- **AND** the subscribers out of service are SUB-007, SUB-008, SUB-018, SUB-019 and SUB-020, a
  count of 5
- **AND** the runs out of service downstream are FR-09

#### Scenario: A run with nothing below its NAP

- **WHEN** the impact of cutting FR-01 is computed
- **THEN** the only NAP out of service is NAP-01, with SUB-001, SUB-002 and SUB-003, a count of 3

#### Scenario: Every element matches the committed oracle

- **WHEN** the impact of cutting each of the 12 fiber runs and each of the 12 NAPs is computed
- **THEN** every list and every count equals the hand-derived values committed in
  `seed/expected-cut-impacts.json`

### Requirement: Losing a NAP and cutting its feeder differ only in what is cut

When the cut element is a NAP, that NAP SHALL be reported as the cut element and SHALL also count
among the NAPs out of service. Its feeder run SHALL keep service. When the cut element is a run,
the NAP at its far end SHALL be out of service, and the run SHALL be reported as the cut element.

#### Scenario: NAP-04 down

- **WHEN** the impact of losing NAP-04 is computed
- **THEN** the cut element is NAP-04, of kind NAP
- **AND** the NAPs out of service are NAP-04 and NAP-09, and the subscribers out of service number 5
- **AND** FR-04 is not out of service, and FR-09 is

#### Scenario: FR-04 cut, for comparison

- **WHEN** the impact of cutting FR-04 is computed
- **THEN** the cut element is FR-04, of kind fiber run
- **AND** the NAPs and subscribers out of service are the same as when NAP-04 is lost

### Requirement: Only fiber runs and NAPs can be cut

The system SHALL accept as a cut element only a fiber run or a NAP that the network contains. Asked
for the OLT, it SHALL refuse with an error saying a cut at the OLT is not supported. Asked for any
other identifier, it SHALL refuse with an error naming it. It SHALL NOT return an empty, partial
or guessed result in either case.

#### Scenario: A cut at the OLT

- **WHEN** the impact of cutting OLT-RES-01 is requested
- **THEN** the request fails with an error saying a cut at the OLT is not supported

#### Scenario: An element that does not exist

- **WHEN** the impact of cutting FR-99 is requested
- **THEN** the request fails with an error naming FR-99, and no list or count is produced
