## Purpose

Shows the synthetic FTTH network on an interactive map beside the assistant, so that an answer
about the network is also pointed at on the map, and any NAP's optical budget can be inspected by
clicking it.

## Requirements

### Requirement: The whole network is drawn on load

The system SHALL draw every element of the loaded network on a map when the page opens, before any
question is asked: the OLT, every NAP, every fiber run following its stored geometry, and every
subscriber. Each kind of element SHALL be visually distinguishable from the others.

The map SHALL draw only what the dataset contains. It SHALL NOT invent positions, runs or
subscribers.

#### Scenario: The seed network appears

- **WHEN** the page is opened with the seed dataset
- **THEN** the map shows one OLT, 12 NAPs, 12 fiber runs and 28 subscribers
- **AND** the initial view contains the OLT and every NAP

#### Scenario: A cascade is visible as geometry

- **WHEN** the page is opened with the seed dataset
- **THEN** fiber run FR-12 is drawn from NAP-03 to NAP-12, not from the OLT
- **AND** fiber run FR-09 is drawn from NAP-04 to NAP-09

#### Scenario: The base map is unavailable

- **WHEN** the base-map tile service cannot be reached
- **THEN** the network is still drawn and remains interactive on a plain background

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

### Requirement: Clicking a NAP shows its optical budget

Clicking a NAP SHALL open a breakdown of that NAP's optical budget: for each hop from the OLT, the
fiber run, its length and fiber loss, the splitter it ends at with its ratio and loss, and its
connector and splice counts and losses; then the total attenuation, the GPON class budget, the
margin and the classification.

Every figure in the breakdown SHALL be produced by the deterministic budget engine on the server.
The browser SHALL only display those figures — it SHALL NOT add, subtract or round them — and the
assistant SHALL play no part in producing them. Any NAP can be inspected this way, whether or not
it is highlighted and whether or not a question has been asked.

#### Scenario: The breakdown of the marginal cascade

- **WHEN** the user clicks NAP-12
- **THEN** the breakdown lists two hops, FR-03 ending at a 1:2 splitter (3.50 dB) and FR-12 ending
  at a 1:16 splitter (13.50 dB)
- **AND** it shows fiber 4.95 dB, splitters 17.00 dB, connectors 2.40 dB, splices 0.88 dB
- **AND** it shows total attenuation 25.23 dB against a B+ budget of 28.00 dB, margin 2.77 dB,
  classified marginal

#### Scenario: The breakdown of the failing link

- **WHEN** the user clicks NAP-09
- **THEN** it shows total attenuation 29.40 dB, margin -1.40 dB, classified fail

#### Scenario: A NAP that passes

- **WHEN** the user clicks NAP-03 before asking anything
- **THEN** it shows total attenuation 7.98 dB, margin 20.02 dB, classified pass

### Requirement: The chat lives beside the map

The chat SHALL be available on the same page as the map, without either one hiding the other on a
desktop-width screen. It SHALL keep the behaviour of the existing chat surface: answers arrive
progressively, tool activity is shown while it happens, failures are shown to the user, and the
conversation continues across turns.

What the assistant says SHALL NOT change because the map exists: when the data does not contain an
answer, the assistant still says so, and the map shows no highlight for it.

#### Scenario: Asking from the map page

- **WHEN** the user types "which NAPs fail the optical budget?" in the chat panel and submits it
- **THEN** the answer streams into the panel while the map stays visible
- **AND** when the turn ends the map applies that turn's highlight

#### Scenario: A question the data cannot answer

- **WHEN** the user asks for a value the project does not model and the assistant calls no tool
- **THEN** the assistant says it does not have that information
- **AND** the map highlight and view do not change

#### Scenario: A narrow screen

- **WHEN** the page is viewed at phone width
- **THEN** the map and the chat are both reachable, stacked, with no horizontal scrolling
