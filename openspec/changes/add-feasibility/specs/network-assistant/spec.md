## ADDED Requirements

### Requirement: The chat request carries the map context

A chat request SHALL be able to carry the state of the map alongside the conversation. Today that
state is one optional selected point, a latitude and a longitude. The server SHALL validate the
point before any model call. If its coordinates are not finite numbers or lie outside the modelled
city, the server SHALL reject the request with an error naming the problem. A request without map
context SHALL behave as one with no point selected.

The map context SHALL NOT be added to the system prompt or to the conversation sent to the model.
It reaches the model only through the result of a tool that reads it.

#### Scenario: A request with a selected point

- **WHEN** a request carries the selected point (-27.4659, -58.9700)
- **THEN** it is accepted, and that point is the one any feasibility evaluation in the turn uses

#### Scenario: A point outside the city

- **WHEN** a request carries the selected point (-34.6037, -58.3816)
- **THEN** it is rejected before any model call, with an error saying the point is outside the
  modelled city

#### Scenario: An older client

- **WHEN** a request carries only the conversation, with no map context
- **THEN** it is accepted, as a request with no point selected

#### Scenario: The prompt prefix does not depend on the point

- **WHEN** two requests carry the same conversation and different selected points
- **THEN** the system prompt, the tool definitions and the messages sent to the model are
  identical in both

### Requirement: A connection-candidates tool for the selected point

The assistant SHALL have a tool that evaluates whether a new customer can be connected at the point
selected on the map. It returns the three nearest NAPs with their verdicts. The tool SHALL take no
coordinates as arguments: it SHALL read the point from the request's map context. The model never
copies a coordinate.

When no point is selected, the tool SHALL return an error telling the assistant to ask the user to
click the map where the customer would connect. The assistant SHALL then ask for that click, and
SHALL NOT name a NAP or state any distance, port count or budget figure for the location.

When the user gives coordinates or an address in the chat instead of selecting a point, the
assistant SHALL ask the user to select the point on the map. It SHALL NOT evaluate a location it
cannot pass to the tool.

The answer SHALL report each candidate's verdict and reasons as the tool returned them, and its
distances, free ports and projected figures exactly. A candidate the tool marks feasible with a
`marginal` projection SHALL be reported with that caveat. A follow-up about another candidate
SHALL be answered from the figures the tool already returned for it. The assistant SHALL NOT state
whether the customer's ONT will work.

#### Scenario: The nearest NAP is full

- **WHEN** the selected point is (-27.4165, -59.0180) and the user asks "¿puedo conectar un cliente
  acá?"
- **THEN** the assistant calls the connection-candidates tool
- **AND** its answer says NAP-03 has no free ports and the other two candidates are too far, so the
  point cannot be connected

#### Scenario: The nearest NAP fails its budget

- **WHEN** the selected point is (-27.4955, -58.9380) and the user asks whether a customer can be
  connected there
- **THEN** the answer says NAP-09 has free ports but the projected link fails, with margin -2.25 dB

#### Scenario: The second option, as a follow-up

- **WHEN** the selected point is (-27.4659, -58.9700), the user has asked whether a customer can be
  connected there, and then asks "¿y si lo conecto a la segunda opción?"
- **THEN** the answer is about NAP-05 and states its figures as the tool returned them: route
  593 m, projected margin 13.83 dB

#### Scenario: No point selected

- **WHEN** no point is selected and the user asks "¿puedo conectar un cliente acá?"
- **THEN** the assistant asks the user to click the map where the customer would connect
- **AND** it names no NAP and states no distance, port count or budget figure

#### Scenario: Coordinates typed into the chat

- **WHEN** no point is selected and the user asks whether a customer can be connected at
  "-27.46, -58.97"
- **THEN** the assistant asks the user to select the point on the map
- **AND** it names no candidate NAP for that location

## MODIFIED Requirements

### Requirement: The map payload is produced by the server

The system SHALL derive the map payload from the tool results the request already holds. The
assistant's output SHALL NOT contribute any part of it.

Each entry SHALL name its kind — a NAP, a subscriber, a fiber run, a point or a candidate — and its
identifier. A NAP, subscriber or run entry SHALL carry a status. A status is either a budget
classification (`pass`, `marginal`, `fail`) or an impact status (`cut`, `out_of_service`). A NAP or
subscriber entry with a budget classification SHALL also carry its margin. An entry with an impact
status SHALL carry no margin. A subscriber entry SHALL also name its serving NAP. A run entry with a
budget classification marks a span on the path of a highlighted NAP or subscriber, and SHALL take
that entity's classification.

A point entry SHALL carry the point's latitude and longitude as the tool echoed them, and the
identifier of the best candidate, or none. A candidate entry SHALL name a NAP and carry its rank
and its feasibility: `feasible`, `marginal` (feasible, with a projected classification of
`marginal`) or `not_feasible`. The payload SHALL indicate whether the map should reframe the view.

The following tool results contribute entries:

- **Detailing a NAP** contributes that NAP and the runs on its path from the OLT.
- **Tracing a subscriber** contributes that subscriber and the runs on its path from the OLT. The
  subscriber's NAP is not added as a NAP entry, because its classification may differ from the
  subscriber's.
- **A cut impact** contributes the cut element with status `cut`, and every NAP, subscriber and run
  out of service with status `out_of_service`.
- **The connection candidates** contribute the evaluated point and one candidate entry per
  candidate. They do not contribute NAP entries, because a candidate's projection is about a
  hypothetical subscriber, not the NAP's own link.
- **The survey** of all NAPs contributes nothing.

When two entries name the same element, the payload SHALL keep one entry for it, with the more
severe status in this order: `cut`, `out_of_service`, `fail`, `marginal`, `pass`. A point entry
and a candidate entry are kept apart from NAP entries. When several connection-candidates calls in
one turn name the same candidate, the later call's entry is kept.

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

#### Scenario: Two feasible candidates

- **WHEN** a turn has evaluated the selected point (-27.4659, -58.9700)
- **THEN** the payload contains a point entry at (-27.4659, -58.9700) whose best candidate is
  NAP-11
- **AND** candidate entries for NAP-11 (rank 1, `feasible`), NAP-05 (rank 2, `feasible`) and NAP-04
  (rank 3, `not_feasible`)
- **AND** no NAP entry

#### Scenario: A feasible candidate with a caveat

- **WHEN** a turn has evaluated the selected point (-27.4930, -59.0338)
- **THEN** the candidate entry for NAP-06 has feasibility `marginal`

#### Scenario: No point, no entries

- **WHEN** the connection-candidates tool returned an error because no point was selected
- **THEN** that call contributes no entry

#### Scenario: A turn that calls no tools yields no highlight

- **WHEN** the assistant answers without calling any tool
- **THEN** the payload contains no entries
- **AND** the map is not asked to reframe

### Requirement: The optical constants are available as a tool

The system SHALL expose a tool returning the project's optical constants, each with its unit and
its standing as industry-typical and pending validation. The operational limits — the recommended
minimum margin and the maximum drop route length — SHALL be included, each marked as operational.

This exists so the assistant can compare a documented figure against the value the system computes
with. Obtaining a constant SHALL remain a tool call: the assistant SHALL NOT derive one by
dividing figures out of a budget breakdown, which would be the model doing arithmetic.

#### Scenario: The constants are reported with their provenance

- **WHEN** the optical constants tool is called
- **THEN** it reports fiber attenuation as 0.25 dB/km at 1490 nm downstream
- **AND** each value carries its unit
- **AND** each is marked as industry-typical and pending validation

#### Scenario: A question about a constant is answered from the tool

- **WHEN** the user asks what loss the system assumes per fusion splice
- **THEN** the constants tool is called
- **AND** the answer states 0.08 dB, matching the tool result exactly

#### Scenario: The maximum drop is reported

- **WHEN** the optical constants tool is called
- **THEN** it reports the maximum drop route length as 600 m, marked operational and pending
  validation
