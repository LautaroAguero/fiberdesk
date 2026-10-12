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

#### Scenario: Cache writes are priced at their own rate

- **WHEN** a call served by `claude-opus-5` reports 1,000 input tokens, 2,500 cache-write tokens and
  200 output tokens, with a 5-minute cache-write price of $6.25 per million
- **THEN** its recorded cost is $0.025625 (0.005 + 0.015625 + 0.005)

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
### Requirement: The stable prefix of every request is cacheable

Every model call the assistant makes SHALL mark the tool definitions and the system prompt as a
cacheable prefix, and SHALL let the growing conversation be cached after it, so that repeated calls
within a turn, and questions that arrive while the prefix is still cached, read it from the prompt
cache instead of paying for it again. Caching SHALL change only how the request is billed: the
system prompt text, the tool definitions and the messages the model receives SHALL be the same as
without it, and so SHALL everything the user receives — the streamed events, the answer, and the
map payload. What the assistant says, including declining explicitly when neither the network nor
the documentation contains the answer, SHALL NOT depend on whether the prefix was read from cache.

#### Scenario: The second call of a turn reads the prefix from cache

- **WHEN** a turn calls the survey tool and then answers, the two calls starting less than five
  minutes apart
- **THEN** the second call reports a non-zero count of cache-read input tokens
- **AND** that count is at least the token size of the tool definitions and system prompt

#### Scenario: Caching changes nothing the model reads

- **WHEN** the same conversation is sent with and without caching
- **THEN** the two requests carry identical system prompt text, tool definitions and messages,
  differing only in cache markers

#### Scenario: Caching changes nothing the user receives

- **WHEN** a turn completes in the chat page with caching on
- **THEN** the streamed event types and the map payload have the same shape as without caching
- **AND** no cache figure is shown to the user; it appears only in the server log line
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
