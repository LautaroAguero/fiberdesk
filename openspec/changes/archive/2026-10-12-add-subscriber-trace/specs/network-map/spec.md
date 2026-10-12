## MODIFIED Requirements

### Requirement: The assistant's highlight is drawn on the map

When a turn ends, the system SHALL apply the map payload from that turn's `done` event. Each listed
NAP and each listed subscriber SHALL be marked with a colour for its classification — one colour
each for `pass`, `marginal` and `fail`. Each listed fiber run SHALL be marked as a path, in the
colour of its own entry's classification. When two entries mark the same run with different
classifications, the run SHALL take the worse one (`fail` over `marginal` over `pass`). NAPs,
subscribers and runs not listed SHALL remain in the neutral un-highlighted style.

The classifications and margins shown SHALL be the ones in the payload. The map SHALL NOT
reclassify an entity, recompute a margin, derive a path the payload does not list, or take any
figure from the assistant's prose.

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

#### Scenario: A shared run takes the worse classification

- **WHEN** a payload lists SUB-006 as `pass` and NAP-12 as `marginal`, and both mark FR-03
- **THEN** FR-03 is drawn in the marginal colour

#### Scenario: A highlight is replaced by the next one

- **WHEN** a turn highlights NAP-09 and a later turn's payload lists only SUB-014 and its run
- **THEN** only SUB-014 and its path are highlighted afterwards

#### Scenario: A turn with no highlight leaves the map as it was

- **WHEN** a turn ends with a payload that lists no entries
- **THEN** the previous highlight, if any, stays on the map
- **AND** the view does not move

#### Scenario: The highlight can be cleared

- **WHEN** a highlight is on the map and the user clears it
- **THEN** every NAP and subscriber returns to the neutral style and no path is marked

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
payload lists are visible. When `fit_bounds` is false the view SHALL NOT move.

#### Scenario: Reframing on the reference question

- **WHEN** a payload lists NAP-09 and NAP-12 and their runs, with `fit_bounds` true
- **THEN** the view contains NAP-09, NAP-12, the OLT and every vertex of FR-03, FR-12, FR-04 and
  FR-09

#### Scenario: Reframing on a traced subscriber

- **WHEN** a payload lists SUB-025 and runs FR-03 and FR-12, with `fit_bounds` true
- **THEN** the view contains SUB-025, the OLT and every vertex of FR-03 and FR-12

#### Scenario: No reframe requested

- **WHEN** a payload has `fit_bounds` false
- **THEN** the view stays where the user left it
