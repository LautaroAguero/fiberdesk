## Purpose

Answers questions about the fiber network in natural language by deciding which optical budget
tools to call, explaining what comes back, and reporting which NAPs the answer concerns — so that
every figure a user reads was computed by deterministic code rather than produced by the model.

## Requirements

### Requirement: Every figure comes from a tool result

The assistant SHALL obtain every numeric fact it states by calling a tool, and SHALL reproduce
those figures unchanged. It SHALL NOT compute, estimate, or infer an optical figure of its own.

When the question cannot be answered from the network dataset or the tools available, the
assistant SHALL say so explicitly and name what it does not have. It SHALL NOT fabricate a value,
a specification, or an equipment configuration to fill the gap.

#### Scenario: A question about failing links is answered from tool results

- **WHEN** the user asks which NAPs fail the optical budget
- **THEN** at least one tool call is made before any figure appears in the answer
- **AND** the answer states NAP-09's margin as -1.40 dB and NAP-12's as 2.77 dB, matching the tool
  results exactly

#### Scenario: A value the project does not model

- **WHEN** the user asks for the receiver sensitivity of the ONT, which the project deliberately
  does not model
- **THEN** the assistant states that the value is not available in the system
- **AND** explains that the budget is computed against the GPON class budget instead
- **AND** no sensitivity figure appears in the answer

#### Scenario: An entity the network does not contain

- **WHEN** the user asks about NAP-13, which the dataset does not contain
- **THEN** the assistant states that no such NAP exists in the network
- **AND** does not report a budget for it

#### Scenario: A question outside the domain

- **WHEN** the user asks something the tools cannot address, such as which equipment to purchase
- **THEN** the assistant says it cannot answer that from the network data it has
- **AND** does not answer from general knowledge as though it were network data

### Requirement: A survey tool that needs no prior knowledge

The system SHALL expose a tool that returns one row per NAP in the network, each carrying the
identifier, the human-readable name, the total attenuation, the margin and the classification.

The tool SHALL require no arguments, so that the assistant can discover which NAPs exist rather
than needing their identifiers in advance. It SHALL accept an optional minimum-margin override.

#### Scenario: The whole network in one call

- **WHEN** the survey tool is called with no arguments
- **THEN** 12 rows are returned, one per NAP
- **AND** the NAP-09 row reports 29.40 dB total, -1.40 dB margin and status `fail`
- **AND** the NAP-12 row reports 25.23 dB total, 2.77 dB margin and status `marginal`
- **AND** the remaining 10 rows report status `pass`

#### Scenario: Rows carry the name a technician would use

- **WHEN** the survey tool is called
- **THEN** the NAP-12 row carries the name `Barrio Güiraldes` alongside its identifier

#### Scenario: The minimum margin can be overridden

- **WHEN** the survey tool is called with a minimum margin of 5.00 dB
- **THEN** the NAP-06 row still reports 24.56 dB total and 3.44 dB margin
- **AND** its status is `marginal` rather than `pass`

### Requirement: A detail tool that attributes loss to a span

The system SHALL expose a tool that returns the full breakdown for one NAP: the totals per loss
source, and the per-hop attribution naming each fiber run traversed and the node housing each
splitter.

#### Scenario: A cascade is attributed hop by hop

- **WHEN** the detail tool is called for NAP-12
- **THEN** two hops are returned
- **AND** the first reports run FR-03 with fiber 2.80 dB and a 1:2 splitter at NAP-03 worth 3.50 dB
- **AND** the second reports run FR-12 with fiber 2.15 dB and a 1:16 splitter at NAP-12 worth
  13.50 dB
- **AND** the totals by source are fiber 4.95 dB, splitters 17.00 dB, connectors 2.40 dB and
  splices 0.88 dB

#### Scenario: The detail supports an explanation the survey cannot

- **WHEN** the assistant explains why NAP-12 is marginal
- **THEN** it can attribute 3.50 dB of the 17.00 dB of splitter loss to NAP-03, a node upstream
- **AND** that attribution is read from the tool result rather than inferred

### Requirement: Tool inputs are structurally constrained

Tool schemas SHALL be declared strictly, so that arguments the assistant produces are valid by
construction rather than by validation after the fact.

The detail tool's NAP identifier SHALL be constrained to the identifiers the loaded network
actually contains.

#### Scenario: An identifier outside the network cannot be produced

- **WHEN** the tool schemas are built from a network containing NAP-01 through NAP-12
- **THEN** the detail tool's identifier parameter admits exactly those twelve values
- **AND** a value such as `NAP-99` is not among them

#### Scenario: The engine still refuses an unknown identifier

- **WHEN** the detail tool is nonetheless invoked with an identifier the network does not contain
- **THEN** an error naming that identifier is returned to the assistant as a tool result
- **AND** the turn continues rather than failing outright

### Requirement: The turn is streamed as it is produced

The system SHALL stream the turn to the client as it happens, rather than returning it once
complete. The stream SHALL carry the assistant's prose incrementally, SHALL report tool activity
as it occurs, and SHALL end with the map payload.

#### Scenario: Prose arrives incrementally

- **WHEN** the assistant produces its answer
- **THEN** the client receives text in successive fragments
- **AND** the first fragment arrives before the answer is complete

#### Scenario: Tool activity is visible while it happens

- **WHEN** the assistant calls the detail tool for NAP-09
- **THEN** the client is told which tool was invoked and for which NAP
- **AND** it is told when that call completed

#### Scenario: The map payload closes the stream

- **WHEN** the turn completes
- **THEN** the final event carries the map payload
- **AND** no further events follow it

### Requirement: The map payload is produced by the server

The system SHALL derive the map payload from the tool results the request already holds. The
assistant's output SHALL NOT contribute any part of it.

Each entry SHALL name a NAP, its classification and its margin. The payload SHALL indicate whether
the map should reframe the view.

#### Scenario: Payload figures match the tool results exactly

- **WHEN** a turn has called tools covering NAP-09 and NAP-12
- **THEN** the payload contains an entry for NAP-09 with margin -1.40 and an entry for NAP-12 with
  margin 2.77
- **AND** each margin is identical to the figure the tool returned, not re-derived

#### Scenario: A turn that calls no tools yields no highlight

- **WHEN** the assistant answers without calling any tool
- **THEN** the payload contains no entries
- **AND** the map is not asked to reframe

### Requirement: Failures reach the user rather than being swallowed

When a tool fails, the system SHALL return the failure to the assistant as a tool result marked as
an error, so the turn can continue and the assistant can explain what went wrong. When the request
itself fails, the client SHALL be told.

#### Scenario: A tool that throws does not end the turn

- **WHEN** a tool invocation raises
- **THEN** the error is returned to the assistant as an errored tool result
- **AND** the loop continues rather than aborting the request

#### Scenario: A tool name the system does not implement

- **WHEN** the assistant requests a tool the system does not expose
- **THEN** an errored tool result naming the unknown tool is returned
- **AND** no code outside the known tool set is executed

#### Scenario: A failure mid-stream is reported

- **WHEN** the upstream request fails after streaming has begun
- **THEN** the client receives an error event rather than a silently truncated answer

### Requirement: The conversation continues across turns

The system SHALL accept prior turns with each request and SHALL make the assistant's earlier tool
calls and their results available to it, so a follow-up question can build on what was already
computed.

#### Scenario: A follow-up refers back to the previous answer

- **WHEN** the user has asked which NAPs fail, and then asks why the second one is marginal
- **THEN** the assistant answers about NAP-12 without the user naming it
- **AND** any figure it states still comes from a tool result

### Requirement: A chat surface exists

The system SHALL provide a page where a question can be typed and the answer read as it arrives.

#### Scenario: A question is asked and answered in the browser

- **WHEN** a user types a question and submits it
- **THEN** the answer appears progressively rather than all at once
- **AND** the exchange remains visible as further questions are asked
