## ADDED Requirements

### Requirement: A trace tool for one subscriber

The assistant SHALL have a tool that returns one subscriber's link budget, traced from the OLT to
the subscriber's ONT: the serving NAP's hops, the drop, the end-to-end totals, the margin, the
classifications of both the subscriber and its NAP, and the estimated received power. Its only
argument SHALL be the subscriber identifier, constrained to the identifiers the network contains.

When the user names a subscriber that the network does not contain, the assistant SHALL say that
no such subscriber exists. It SHALL NOT call a tool with a substitute identifier, and SHALL NOT
produce figures for it.

#### Scenario: Tracing a subscriber by identifier

- **WHEN** the user asks why SUB-025's signal is low
- **THEN** the assistant calls the trace tool for SUB-025
- **AND** every figure in its answer — 26.15 dB total, 1.85 dB margin, 0.92 dB of drop, −23.15 dBm
  received — is a figure the tool returned

#### Scenario: Tracing a subscriber by name

- **WHEN** the user asks about "el cliente Subscriber 014"
- **THEN** the assistant calls the trace tool for SUB-014

#### Scenario: A subscriber that does not exist

- **WHEN** the user asks about SUB-099
- **THEN** the assistant says the network has no such subscriber
- **AND** no trace tool call names any other subscriber in its place

#### Scenario: A passing NAP does not vouch for its subscriber

- **WHEN** the user asks about SUB-011, whose NAP-06 passes but whose own link is marginal
- **THEN** the answer reports the subscriber as marginal, with the margin the tool returned

### Requirement: The assistant does not promise that an ONT will work

The system models no ONT receiver sensitivity. When asked whether a subscriber's ONT will work, or
whether its received power is enough, the assistant SHALL say that the system cannot answer that
and why. What it reports instead SHALL be limited to the tool's figures: the classification against
the class budget, and the received power presented as an estimate.

#### Scenario: Asked whether a subscriber will have service

- **WHEN** the user asks whether SUB-018's ONT will work with −27.32 dBm
- **THEN** the assistant says the receiver sensitivity is not modelled, so it cannot say
- **AND** it does not state a sensitivity threshold or a verdict on the ONT

## MODIFIED Requirements

### Requirement: The map payload is produced by the server

The system SHALL derive the map payload from the tool results the request already holds. The
assistant's output SHALL NOT contribute any part of it.

Each entry SHALL name its kind — a NAP, a subscriber or a fiber run — its identifier and its
classification. A NAP or subscriber entry SHALL also carry its margin. A subscriber entry SHALL
also name its serving NAP. A run entry marks a span on the path of a highlighted NAP or subscriber
and SHALL take that entity's classification. The payload SHALL indicate whether the map should
reframe the view.

Detailing a NAP SHALL contribute that NAP and the runs on its path from the OLT. Tracing a
subscriber SHALL contribute that subscriber and the runs on its path from the OLT. The subscriber's
NAP is not added as a NAP entry, because its classification may differ from the subscriber's. The
survey of all NAPs SHALL contribute nothing.

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

#### Scenario: A turn that calls no tools yields no highlight

- **WHEN** the assistant answers without calling any tool
- **THEN** the payload contains no entries
- **AND** the map is not asked to reframe
