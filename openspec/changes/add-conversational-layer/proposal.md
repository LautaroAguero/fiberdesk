# Conversational layer

**Phase 1** — the second and final half. The optical budget engine landed in the first half; this
change is the assistant that calls it. With this, Phase 1 is demonstrable on its own.

## Why

The engine computes, and nothing calls it. FiberDesk is a copilot, and there is no copilot yet —
`calculateBudget` can only be reached from a test file.

This is also where the rule the project rests on stops being enforceable by inspection and starts
being enforceable by architecture. Until now, "the model does not calculate" was true because
there was no model. From here it is true because the model can only obtain a number by asking for
a tool call, and the tool is deterministic TypeScript that already has 96 tests behind it.

## What Changes

- Add the Anthropic SDK and a `POST /api/chat` route handler that streams its answer.
- Expose two tools to the model, named for the shape of their answer rather than the operation:
  - `summarize_optical_budgets` — one thin row per NAP (id, name, total loss, margin, status),
    with an optional minimum-margin override. Takes no required arguments, so the model needs no
    prior knowledge of which NAPs exist.
  - `detail_optical_budget` — the full per-hop breakdown of one NAP, the only source that can
    attribute a loss to a specific span or splitter.
- Constrain both tool schemas with `strict: true`, and enumerate the valid NAP identifiers in
  `detail_optical_budget` so an identifier the network does not contain cannot be produced at all.
- Run the tool-use loop by hand rather than through the SDK's tool runner, because the handler
  must retain every tool result to build the map payload.
- **Project the map highlight in code**, from the tool results the handler already holds, rather
  than asking the model to emit it.
- Stream three kinds of event to the client: the assistant's prose as it is generated, tool
  activity as it happens, and the map highlight once the turn completes.
- Add a deliberately plain chat page — an input, a transcript, and text arriving token by token.
  No styling beyond what makes it readable, and no map.
- Unit-test everything in the handler that is deterministic: tool dispatch, the highlight
  projection, the stream encoding, and the error paths.

**This change introduces no arithmetic of its own.** Every number it can produce comes from the
Phase 1 engine through a tool call. A figure that reaches the user without having passed through
`src/lib/optical/` is a bug, and the design is arranged so that there is no path for one.

## Non-goals

- **No map.** Phase 3. The highlight payload is produced and streamed, but nothing draws it yet;
  the chat page ignores it beyond logging that it arrived.
- **No documentation retrieval.** Phase 2. The assistant answers from the network dataset and the
  tools, and says so when a question needs anything else.
- **No evals.** Deciding whether the model chose the right tool, or declined to invent an answer,
  needs a graded run against the live API. That is deliberately out of scope: the behaviour is
  specified and verified by hand once. Nothing automated will catch it if it later regresses, and
  the design records that gap rather than hiding it.
- **No SDK tool runner.** The loop is written out.
- **No conversation persistence.** History lives in the browser tab and dies with it. No database,
  no session store.
- **No authentication, rate limiting, or cost controls.** Single-user local development.
- **No deployment configuration.** The seed is read from disk, which works in development and is a
  known Phase 4 problem.
- **No changes to `network-dataset` or `optical-budget`.** Both are read through their existing
  public functions.

## Capabilities

### New Capabilities

- `network-assistant`: answering questions about the network in natural language by orchestrating
  the optical budget tools, streaming the answer as it is produced, and reporting which NAPs the
  answer concerns.

### Modified Capabilities

None. The engine and the dataset are consumed, not changed.

## Impact

- **New files**: `src/app/api/chat/route.ts`; `src/lib/assistant/` for the tool definitions, the
  dispatcher, the highlight projection and the stream protocol, with their tests; a chat page
  under `src/app/`.
- **`package.json`**: adds `@anthropic-ai/sdk`.
- **Environment**: requires `ANTHROPIC_API_KEY`. The first secret the project needs — `.env*` is
  already ignored by git.
- **Cost**: the first change whose tests could spend money. They do not: every test runs against
  recorded fixtures, never the live API.
- **Downstream**: Phase 3's map consumes the highlight payload this change defines, so its shape
  becomes a contract. Phase 2 adds a third tool alongside these two.
