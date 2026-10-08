## ADDED Requirements

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
