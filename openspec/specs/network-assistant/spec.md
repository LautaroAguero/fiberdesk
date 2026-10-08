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

### Requirement: A documentation search tool

The system SHALL expose a tool that searches the technical documentation corpus and returns the
matching sections in citable form.

The tool's description SHALL state that the corpus is written in English, so that a question asked
in another language produces a query the corpus can actually match.

When the search returns nothing, the assistant SHALL say the documentation does not cover the
subject. It SHALL NOT answer from general knowledge in its place, and SHALL NOT present such an
answer as though it came from the documentation.

#### Scenario: A documentation question is answered from the corpus

- **WHEN** the user asks how cascaded splitters affect a link budget
- **THEN** the documentation search tool is called
- **AND** the answer quotes the returned passage and names the document it came from

#### Scenario: A question in Spanish searches an English corpus

- **WHEN** the user asks, in Spanish, about attenuation caused by moisture
- **THEN** the query sent to the tool is in English
- **AND** relevant passages are returned rather than an empty result

#### Scenario: The corpus does not cover the subject

- **WHEN** the user asks about something the corpus contains no passage on
- **THEN** the assistant states that the documentation does not cover it
- **AND** offers no substitute figure or specification of its own

#### Scenario: A network question does not search the documentation

- **WHEN** the user asks which NAPs fail the optical budget
- **THEN** the documentation search tool is not called
- **AND** the answer comes from the optical budget tools alone

### Requirement: The optical constants are available as a tool

The system SHALL expose a tool returning the project's optical constants, each with its unit and
its standing as industry-typical and pending validation.

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

### Requirement: A disagreement between documentation and the constants is surfaced

When a document states a figure that differs from the corresponding optical constant, the
assistant SHALL report both values, name where each came from, and state plainly that they
disagree. It SHALL NOT silently prefer one, and SHALL NOT present the documented figure as the
value the system computes with.

#### Scenario: The documented fiber attenuation disagrees with the constant

- **WHEN** the user asks what fiber attenuation to assume at 1490 nm
- **THEN** the assistant reports the documented 0.22 dB/km, citing the document
- **AND** reports that the system computes with 0.25 dB/km, from the constants tool
- **AND** states that the two disagree
- **AND** does not resolve the disagreement by choosing one on the user's behalf

#### Scenario: A budget figure is unaffected by the documented value

- **WHEN** the user asks, in the same conversation, for NAP-12's optical budget
- **THEN** the total attenuation is 25.23 dB, computed with the 0.25 dB/km constant
- **AND** the documented 0.22 dB/km figure does not enter the calculation

### Requirement: Every model call's usage and cost is recorded

For every model call in a turn, the system SHALL record the model that served it, its input,
output, cache-read and cache-write token counts as the API reported them, its latency, and its cost
in US dollars. Cost SHALL be computed by code from a pricing table in configuration, never by the
model.

#### Scenario: Cost of a call without caching

- **WHEN** a call served by `claude-opus-5` (priced at $5 input and $25 output per million tokens)
  reports 2,000 input tokens, 500 output tokens and no cache activity
- **THEN** its recorded cost is $0.0225 (2,000 × $5 / 1M + 500 × $25 / 1M)

#### Scenario: Cache reads are priced at their own rate

- **WHEN** a call served by `claude-opus-5` reports 1,000 input tokens, 3,000 cache-read tokens and
  200 output tokens, with a cache-read price of $0.50 per million
- **THEN** its recorded cost is $0.0115 (0.005 + 0.0015 + 0.005)

#### Scenario: A call served by a model the table does not price

- **WHEN** a call is served by a model absent from the pricing table
- **THEN** its tokens are still recorded, its cost is recorded as unknown, and the model is named
- **AND** the turn's answer reaches the user unaffected

### Requirement: The pricing table states where its prices came from

Every price in the pricing table SHALL carry its unit, the date it was verified and its source,
the same way the optical constants carry theirs. A price derived from another rather than read
from the source SHALL say so.

#### Scenario: A price is traceable

- **WHEN** a person reads the pricing configuration
- **THEN** each model's input, output, cache-read and cache-write price names its unit (US dollars
  per million tokens), its verification date and its source

### Requirement: Each turn's usage is summed and logged server-side

At the end of each turn, the system SHALL sum its calls' tokens, latency and cost, and record the
number of model iterations and the ordered tool trajectory, including which iteration each tool
call belonged to. The chat route SHALL write this summary as one structured log line per turn,
without the conversation's text.

#### Scenario: A survey-then-detail turn

- **WHEN** a turn makes three model calls — the survey, the two details in parallel, then the
  answer
- **THEN** its summary reports 3 iterations, the trajectory `summarize_optical_budgets` (iteration
  1), `detail_optical_budget` ×2 (iteration 2), and the sum of the three calls' tokens and cost

#### Scenario: Turn costs are not shown to the user

- **WHEN** a turn completes in the chat page
- **THEN** the streamed events and the map payload are the same as before this requirement
- **AND** the usage summary appears only in the server log

#### Scenario: A turn that fails part-way still reports what it spent

- **WHEN** the second model call of a turn fails after the first succeeded
- **THEN** the first call's usage and cost are still recorded for that turn
