## ADDED Requirements

### Requirement: A cut impact tool for one fiber run or NAP

The assistant SHALL have a tool that returns what a cut of one fiber run or one NAP takes out of
service: the NAPs, subscribers and runs downstream, and their counts. Its only argument SHALL be
the element identifier, constrained to the network's fiber runs and NAPs.

When the answer states how many NAPs or subscribers lose service, that number SHALL be the count
the tool returned. The assistant SHALL NOT count a list itself. When the user asks about a cut at
the OLT, the assistant SHALL say that a cut at the OLT is not supported, and SHALL NOT state what
it would take out. When the user names an element the network does not contain, the assistant
SHALL say it does not exist, and SHALL NOT call the tool with a substitute.

#### Scenario: A feeder cut through a cascade

- **WHEN** the user asks what happens if FR-03 is cut
- **THEN** the assistant calls the cut impact tool for FR-03
- **AND** its answer names NAP-03 and NAP-12 and states 5 subscribers out of service, figures the
  tool returned

#### Scenario: How many customers, as a follow-up

- **WHEN** the user has asked about a cut of FR-04 and then asks "¿cuántos clientes son?"
- **THEN** the answer states 5, the subscriber count the tool returned for FR-04

#### Scenario: A cut at the OLT

- **WHEN** the user asks what happens if the OLT goes down
- **THEN** the assistant says a cut at the OLT is not supported
- **AND** it states no count of affected NAPs or subscribers

#### Scenario: An element that does not exist

- **WHEN** the user asks what happens if FR-99 is cut
- **THEN** the assistant says the network has no such element
- **AND** no cut impact tool call names any other element in its place

## MODIFIED Requirements

### Requirement: The map payload is produced by the server

The system SHALL derive the map payload from the tool results the request already holds. The
assistant's output SHALL NOT contribute any part of it.

Each entry SHALL name its kind — a NAP, a subscriber or a fiber run — its identifier and its status.
A status is either a budget classification (`pass`, `marginal`, `fail`) or an impact status (`cut`,
`out_of_service`). A NAP or subscriber entry with a budget classification SHALL also carry its
margin. An entry with an impact status SHALL carry no margin. A subscriber entry SHALL also name its
serving NAP. A run entry with a budget classification marks a span on the path of a highlighted NAP
or subscriber, and SHALL take that entity's classification. The payload SHALL indicate whether the
map should reframe the view.

The following tool results contribute entries:

- **Detailing a NAP** contributes that NAP and the runs on its path from the OLT.
- **Tracing a subscriber** contributes that subscriber and the runs on its path from the OLT. The
  subscriber's NAP is not added as a NAP entry, because its classification may differ from the
  subscriber's.
- **A cut impact** contributes the cut element with status `cut`, and every NAP, subscriber and run
  out of service with status `out_of_service`.
- **The survey** of all NAPs contributes nothing.

When two entries name the same element, the payload SHALL keep one entry for it, with the more
severe status in this order: `cut`, `out_of_service`, `fail`, `marginal`, `pass`.

#### Scenario: Payload figures match the tool results exactly

- **WHEN** a turn has called tools covering NAP-09 and NAP-12
- **THEN** the payload contains a NAP entry for NAP-09 with margin -1.40 and a NAP entry for NAP-12
  with margin 2.77
- **AND** each margin is identical to the figure the tool returned, not re-derived
- **AND** it contains run entries for FR-04 and FR-09 classified `fail`, and for FR-03 and FR-12
  classified `marginal`

#### Scenario: A traced subscriber

- **WHEN** a turn has traced SUB-025
- **THEN** the payload contains a subscriber entry for SUB-025, served by NAP-12, classified
  `marginal` with margin 1.85
- **AND** run entries for FR-03 and FR-12 classified `marginal`
- **AND** no NAP entry

#### Scenario: A cut through a cascade

- **WHEN** a turn has asked for the impact of cutting FR-03
- **THEN** the payload contains a run entry for FR-03 with status `cut`
- **AND** NAP entries for NAP-03 and NAP-12, subscriber entries for SUB-006 and SUB-025 to SUB-028,
  and a run entry for FR-12, all with status `out_of_service` and no margin

#### Scenario: An outage outranks a budget classification

- **WHEN** a turn has detailed NAP-12 (`marginal`) and asked for the impact of cutting FR-03
- **THEN** the payload holds a single entry for NAP-12, with status `out_of_service`
- **AND** a single entry for FR-03, with status `cut`

#### Scenario: A turn that calls no tools yields no highlight

- **WHEN** the assistant answers without calling any tool
- **THEN** the payload contains no entries
- **AND** the map is not asked to reframe
