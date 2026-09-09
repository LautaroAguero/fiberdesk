# Design — conversational layer

## Context

`src/lib/optical/` computes budgets and `src/lib/network/` loads the dataset; both are pure
TypeScript with 96 tests. Nothing calls them outside test files. See `proposal.md` — *Why* and
`specs/network-assistant/spec.md` for the contract.

The Messages API is stateless: every request carries the whole conversation. What looks like "the
model used a tool" is two or more HTTP round trips that this handler drives, with `stop_reason`
as the control flow. Nothing about the loop is hidden by the platform, which is why most of the
decisions below are about who owns which part of it.

## Goals / Non-Goals

**Goals:**

- Make it structurally impossible for a figure to reach the user without passing through the
  engine.
- Keep as much of the handler as possible deterministic, because that is the part that can be
  tested at all.
- Spend tokens where they buy an explanation and nowhere else.
- Feel responsive within the thirty seconds the reference use case allows.

**Non-Goals (design level):**

- Designing the map's rendering. The payload shape is fixed here; drawing it is Phase 3.
- Any retrieval or citation machinery. Phase 2.
- Multi-user concerns: sessions, auth, quotas, persistence.

## Decisions

### 1. Survey first, detail second — and why not twelve parallel calls

The reference use case originally had the model fire `calculate_optical_budget` at all twelve NAPs
at once. Two things are wrong with that.

Measured against the committed dataset: twelve full breakdowns are ~1,650 tokens, against ~261 for
twelve compact rows plus ~370 for full detail on the two links that actually fail. Only those two
are ever cited, so the other ten breakdowns are paid for and discarded.

The deeper problem is that fanning out to twelve calls requires the model to know all twelve
identifiers *before it starts*. They would have to be injected into the prompt on every turn, or
discovered with an extra round trip. A survey tool that takes no arguments discovers them as part
of doing its job.

```
  REQUEST 1   user question
              <- tool_use: summarize_optical_budgets {}
                    |
              12 thin rows                                    ~261 tok

  REQUEST 2   + assistant turn + tool_result
              <- tool_use: detail NAP-09, tool_use: detail NAP-12
                    |            |
              both blocks arrive together -> executed together

  REQUEST 3   + assistant turn + BOTH tool_results in ONE user message
              <- text, streamed to the client                 ~370 tok
```

*Trade accepted:* three round trips instead of two. Roughly a thousand tokens and the identifier
injection buy one extra hop of latency, which decision 7 then works to hide.

*Parallelism is kept but not staged.* When the model asks for both details in one turn, they go out
together because that is the default. Suppressing it would cost latency and save nothing.

### 2. Tools are named for the shape of their answer

`summarize_optical_budgets` and `detail_optical_budget`, not `calculate_all_budgets` and
`calculate_optical_budget`. The model selects a tool by reading its name and description and
nothing else; two names differing by a word in the middle are an invitation to confuse them.
`summarize` and `detail` name the thing the model is actually choosing between.

The descriptions carry the survey-then-detail strategy in prose — that is the whole mechanism.
Nothing in the code sequences these calls.

### 3. `strict: true`, and the identifiers as an enum

Both tools declare strict schemas. The detail tool's `nap_id` is an enum built from the loaded
network, so a NAP the dataset does not contain cannot be generated.

The engine already raises a named error for an unknown identifier, so the enum fixes no bug — it
saves a round trip that would otherwise be spent discovering the mistake.

*Cost, stated plainly:* the tool definitions become coupled to the data, and `tools` render first
in the prompt-cache prefix, so a change to the network invalidates the whole cached prefix. With a
static twelve-NAP dataset that is free. It would not survive a network of thousands, where the
enum stops being an option at all. That limit is acknowledged rather than designed around: this is
a demonstration project.

### 4. The loop is written out, not delegated to the tool runner

The SDK's tool runner would drive the request/execute/repeat cycle for us. It is not used here.

The deciding reason is decision 5: the handler must retain every tool result in order to build the
map payload. Under the runner those results are born and die inside each tool's `run` function,
and collecting them means accumulating into a closure the loop cannot see — plumbing that reads as
incidental and is easy to break later.

Two lesser reasons: the handler interleaves its own events into the stream, which is more natural
when it owns the loop; and the runner is beta, which is an unwelcome dependency in the piece that
is hardest to debug.

*Consequence to respect:* when an assistant turn contains several `tool_use` blocks, **all** their
results go back in a single user message. Splitting them across messages degrades the model's
willingness to make parallel calls, silently and without error.

### 5. The map payload is projected, never emitted

Every field of the highlight — identifier, status, margin — already exists in a tool result
produced by deterministic code. Asking the model to emit it would be asking it to copy numbers,
and copying is precisely where a model writes 2.7 for 2.77.

This is the same rule that governs arithmetic, applied to structured output. It also has a
testing consequence worth naming:

```
  deterministic, unit-testable          model behaviour, needs an eval
  ----------------------------          ------------------------------
  tool dispatch                         does it survey before detailing?
  highlight projection      <-- moved   does it decline to invent?
  stream encoding                       is the prose accurate?
  error paths
```

Projecting the highlight in code moved a whole row from the right column to the left. That is not
incidental — it is the reason to prefer it.

### 6. The stream carries three kinds of event

Server-Sent Events over the route handler's `ReadableStream`, with a discriminated union: prose
deltas, tool activity, and a terminal payload carrying the highlight. Errors are their own event
type rather than a truncated stream.

Tool activity is on the wire because the survey-then-detail flow spends its first round trip
before a single word of prose exists. Without it the interface is blank while real work happens.
Phase 3 will draw on the same events to animate the map.

The payload shape becomes a contract Phase 3 binds to, so it is defined here rather than left to
whatever the handler happens to emit.

### 7. Model configuration is part of the latency budget

`claude-opus-5`, with three settings that exist for the thirty-second demo rather than for output
quality:

- **`effort` low or medium.** Summing twelve budgets and naming the failures is not work that
  repays deep reasoning.
- **`thinking.display: "summarized"`.** Thinking is on by default on this model and its display
  defaults to omitted, which streams empty thinking blocks — the user watches a dead screen for
  several seconds before anything appears. Summarised display turns that pause into visible
  progress.
- **Streaming with a generous `max_tokens`.** Streaming is what makes the first two settings
  visible at all.

### 8. Tests never call the API

Every test in this change runs against recorded fixtures: assistant turns captured as JSON, fed to
the loop, with the tools executing for real against the seed. The loop, the dispatcher, the
projection and the encoder are all exercised; the model is not.

This keeps the suite free, fast and deterministic, and it is the reason the suite can be run in a
loop while developing.

### 9. No evals, and what that costs

Whether the model surveys before detailing, and whether it declines to invent rather than
answering anyway, cannot be checked by the tests above. Those need a graded run against the live
API, which is out of scope.

The consequence, recorded so nobody later assumes otherwise: **those behaviours are specified and
will be verified by hand once. If they regress, nothing will notice.** The specification is real;
the enforcement is not. Should this project ever need that guarantee, an eval set is the change
that provides it.

## Risks / Trade-offs

- **The model may not follow survey-then-detail** → the strategy lives in tool descriptions, which
  influence but do not compel. Mitigation is wording and the fact that the survey is genuinely the
  cheaper path to the answer. No automated check will catch a regression here — see decision 9.
- **The identifier enum couples tool definitions to the dataset** → and invalidates the cache
  prefix when the network changes. Accepted for twelve static NAPs; called out because it is the
  first decision in the project that would not survive scale.
- **Three round trips against a thirty-second budget** → decision 7 exists to spend that budget
  well. If it proves too slow, the fallback is a single tool returning full detail for a caller-
  chosen subset, at higher token cost.
- **An API key enters the project** → `.env*` is already ignored, and no key may appear in any
  committed file, fixture or test.
- **Every turn costs money** → there is no per-user budget and no rate limit; a runaway loop is
  bounded only by the iteration cap the handler imposes on itself, which it must impose.
- **The chat page is deliberately ugly** → and may read as unfinished work. It is finished for what
  it is: the smallest surface that makes Phase 1 demonstrable without pre-empting Phase 3.

## Migration Plan

Additive; no existing consumers. Rollback is deleting the added files, the dependency and the
environment variable.

## Open Questions

- How much should a tool-activity event carry beyond the tool name and the NAP it concerns — the
  arguments, the elapsed time, a summary of the result? Deferrable: the spec fixes the minimum,
  and anything further is an additive field on an event Phase 3 has not yet consumed. What the map
  wants to animate is not knowable until the map exists.

Settled during exploration, recorded here so they are not reopened: the survey tool does expose
its minimum-margin override (a user asking "check with 5 dB" is choosing what to compute, which is
orchestration, not calculation); the loop is written out rather than delegated; and evals are out
of scope with the gap documented in decision 9.
