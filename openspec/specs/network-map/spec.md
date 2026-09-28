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
NAP SHALL be marked with a colour for its classification — one colour each for `pass`, `marginal`
and `fail` — and the fiber path from the OLT to that NAP SHALL be marked. NAPs not listed SHALL
remain in the neutral un-highlighted style.

The classification and margin shown SHALL be the ones in the payload. The map SHALL NOT
reclassify a NAP, recompute a margin, or take any figure from the assistant's prose.

#### Scenario: The reference question

- **WHEN** a turn ends with a payload listing NAP-12 as `marginal` with margin 2.77 and NAP-09 as
  `fail` with margin -1.40
- **THEN** NAP-12 is drawn in the marginal colour and NAP-09 in the fail colour
- **AND** the path FR-03 → FR-12 is marked for NAP-12 and FR-04 → FR-09 for NAP-09
- **AND** the other ten NAPs stay neutral

#### Scenario: A highlight is replaced by the next one

- **WHEN** a turn highlights NAP-09 and a later turn's payload lists only NAP-01
- **THEN** only NAP-01 is highlighted afterwards

#### Scenario: A turn with no highlight leaves the map as it was

- **WHEN** a turn ends with a payload that lists no NAPs
- **THEN** the previous highlight, if any, stays on the map
- **AND** the view does not move

#### Scenario: The highlight can be cleared

- **WHEN** a highlight is on the map and the user clears it
- **THEN** every NAP returns to the neutral style and no path is marked

#### Scenario: A payload names a NAP the map does not know

- **WHEN** a payload lists an identifier that is not a NAP in the loaded network
- **THEN** that entry is ignored, the remaining entries are still drawn, and nothing is added to the
  map at an invented position

### Requirement: The view reframes when the payload asks

When a payload has `fit_bounds` true and at least one NAP entry the map knows, the system SHALL
move the view so that every highlighted NAP and its whole path back to the OLT are visible. When
`fit_bounds` is false the view SHALL NOT move.

#### Scenario: Reframing on the reference question

- **WHEN** a payload lists NAP-09 and NAP-12 with `fit_bounds` true
- **THEN** the view contains NAP-09, NAP-12, the OLT and every vertex of FR-03, FR-12, FR-04 and
  FR-09

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
