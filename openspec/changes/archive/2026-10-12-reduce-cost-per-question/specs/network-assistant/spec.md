## ADDED Requirements

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

## MODIFIED Requirements

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
