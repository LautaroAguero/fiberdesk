## MODIFIED Requirements

### Requirement: The assistant's highlight is drawn on the map

When a turn ends, the system SHALL apply the map payload from that turn's `done` event. Each listed
NAP and each listed subscriber SHALL be marked with a colour for its status: one colour each for
`pass`, `marginal` and `fail`, and two more styles, distinct from those three and from each other,
for `cut` and `out_of_service`. Each listed fiber run SHALL be marked in the style of its own
entry's status. A run with a budget classification SHALL be marked as a path. A run with status
`cut` SHALL be marked as the cut. A run with status `out_of_service` SHALL be marked as dark. When
two entries mark the same element with different statuses, it SHALL take the more severe one, in
the order `cut`, `out_of_service`, `fail`, `marginal`, `pass`. NAPs, subscribers and runs not listed
SHALL remain in the neutral un-highlighted style.

The statuses and margins shown SHALL be the ones in the payload. The map SHALL NOT reclassify an
entity, recompute a margin, derive a path or a downstream set the payload does not list, or take
any figure from the assistant's prose.

#### Scenario: The reference question

- **WHEN** a turn ends with a payload listing NAP-12 as `marginal` with margin 2.77, NAP-09 as
  `fail` with margin -1.40, and their runs
- **THEN** NAP-12 is drawn in the marginal colour and NAP-09 in the fail colour
- **AND** the path FR-03 → FR-12 is marked in the marginal colour and FR-04 → FR-09 in the fail
  colour
- **AND** the other ten NAPs stay neutral

#### Scenario: A traced subscriber

- **WHEN** a turn ends with a payload listing SUB-025 as `marginal` with margin 1.85, and runs FR-03
  and FR-12 as `marginal`
- **THEN** SUB-025 is drawn in the marginal colour and the path FR-03 → FR-12 is marked in the
  marginal colour
- **AND** NAP-12 and every other subscriber stay neutral

#### Scenario: A cut through a cascade

- **WHEN** a turn ends with a payload listing FR-03 as `cut`, and NAP-03, NAP-12, SUB-006, SUB-025
  to SUB-028 and FR-12 as `out_of_service`
- **THEN** FR-03 is drawn in the cut style
- **AND** NAP-03, NAP-12, FR-12 and the five subscribers are drawn in the out-of-service style
- **AND** the other ten NAPs, the other runs and the other subscribers stay neutral

#### Scenario: A shared run takes the worse classification

- **WHEN** a payload lists SUB-006 as `pass` and NAP-12 as `marginal`, and both mark FR-03
- **THEN** FR-03 is drawn in the marginal colour

#### Scenario: An outage outranks a classification on the same element

- **WHEN** a payload marks FR-03 both as `marginal` and as `cut`
- **THEN** FR-03 is drawn in the cut style

#### Scenario: A highlight is replaced by the next one

- **WHEN** a turn highlights NAP-09 and a later turn's payload lists only SUB-014 and its run
- **THEN** only SUB-014 and its path are highlighted afterwards

#### Scenario: A turn with no highlight leaves the map as it was

- **WHEN** a turn ends with a payload that lists no entries
- **THEN** the previous highlight, if any, stays on the map
- **AND** the view does not move

#### Scenario: The highlight can be cleared

- **WHEN** a highlight is on the map and the user clears it
- **THEN** every NAP, subscriber and run returns to the neutral style

#### Scenario: A payload names a NAP the map does not know

- **WHEN** a payload lists a NAP identifier that is not in the loaded network
- **THEN** that entry is ignored, the remaining entries are still drawn, and nothing is added to the
  map at an invented position

#### Scenario: A payload names a subscriber or run the map does not know

- **WHEN** a payload lists a subscriber or run identifier that is not in the loaded network
- **THEN** that entry is ignored, the remaining entries are still drawn, and nothing is added to the
  map at an invented position

### Requirement: The view reframes when the payload asks

When a payload has `fit_bounds` true and at least one NAP or subscriber entry the map knows, the
system SHALL move the view so that every highlighted NAP and subscriber, the OLT, and every run the
payload lists, including a cut run, are visible. When `fit_bounds` is false the view SHALL NOT move.

#### Scenario: Reframing on the reference question

- **WHEN** a payload lists NAP-09 and NAP-12 and their runs, with `fit_bounds` true
- **THEN** the view contains NAP-09, NAP-12, the OLT and every vertex of FR-03, FR-12, FR-04 and
  FR-09

#### Scenario: Reframing on a traced subscriber

- **WHEN** a payload lists SUB-025 and runs FR-03 and FR-12, with `fit_bounds` true
- **THEN** the view contains SUB-025, the OLT and every vertex of FR-03 and FR-12

#### Scenario: Reframing on a cut

- **WHEN** a payload lists the cut of FR-03 and its out-of-service subtree, with `fit_bounds` true
- **THEN** the view contains NAP-03, NAP-12, SUB-006, SUB-025 to SUB-028, the OLT and every vertex
  of FR-03 and FR-12

#### Scenario: No reframe requested

- **WHEN** a payload has `fit_bounds` false
- **THEN** the view stays where the user left it
