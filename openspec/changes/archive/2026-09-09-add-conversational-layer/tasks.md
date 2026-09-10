# Tasks — conversational layer

The design's single Open Question (how much a tool-activity event should carry) is additive to an
event Phase 3 has not consumed yet, and gates no task below.

Every test in this change runs against recorded fixtures and the real seed. **No task may call the
Anthropic API from the test suite**, except the one manual verification in group 9, which is run
by hand and not automated.

## 1. Dependency and environment

- [x] 1.1 Add `@anthropic-ai/sdk`, and an `.env.example` documenting `ANTHROPIC_API_KEY` without
      containing one; verify `npx tsc --noEmit` passes and `git status` shows no `.env` staged.
- [x] 1.2 Add a server-only client module that reads the key from the environment and fails with a
      message naming the missing variable; include a unit test that constructing it without the
      variable throws that message rather than a generic error.

## 2. The tool surface

- [x] 2.1 Implement the survey adapter over `calculateAllBudgets`, returning one thin row per NAP
      with id, name, total loss, margin and status; include unit tests that 12 rows come back, that
      NAP-09 reads 29.40 / -1.40 / `fail`, that NAP-12 reads 25.23 / 2.77 / `marginal`, and that the
      other ten read `pass`.
- [x] 2.2 Pass the optional minimum-margin override through to the engine; include a unit test that
      at 5.00 dB the NAP-06 row still reads 24.56 dB total and 3.44 dB margin but its status becomes
      `marginal`.
- [x] 2.3 Implement the detail adapter over `calculateBudget`, returning the full per-hop result;
      include unit tests that NAP-12 returns two hops — FR-03 with fiber 2.80 and a 1:2 splitter at
      NAP-03 worth 3.50, FR-12 with fiber 2.15 and a 1:16 at NAP-12 worth 13.50 — and by-source
      totals of 4.95 / 17.00 / 2.40 / 0.88.
- [x] 2.4 Build both tool definitions with `strict: true`, `additionalProperties: false` and
      explicit `required`, deriving the detail tool's identifier enum from the loaded network;
      include unit tests that the enum holds exactly the twelve seed identifiers and that `NAP-99`
      is absent.
- [x] 2.5 Write the two tool descriptions so that they, and not any code path, carry the
      survey-then-detail strategy; verify by reading them back against the design's decision 2 —
      the survey must read as the first move and the detail as the follow-up.

## 3. Dispatch

- [x] 3.1 Implement the dispatcher mapping a tool name and its arguments to the matching adapter
      and returning tool-result content; include unit tests covering both tools.
- [x] 3.2 Add the error paths: an unknown tool name and an adapter that throws both yield an
      errored tool result naming the offender rather than aborting; include unit tests for each,
      asserting no adapter outside the known set is reached.

## 4. The loop

- [x] 4.1 Implement the manual loop over `stop_reason`, appending each assistant turn verbatim and
      returning **all** tool results from one turn in a single user message; include unit tests
      driven by recorded assistant turns that assert the single-message grouping for a turn holding
      two tool calls.
- [x] 4.2 Accept prior turns with the request and replay them, so earlier tool calls and results
      remain visible; include a unit test that a follow-up request carries the previous turn's tool
      results into the next request body.
- [x] 4.3 Add a self-imposed iteration cap so a misbehaving turn cannot loop indefinitely; include a
      unit test that the cap terminates the loop and reports why.

## 5. The stream

- [x] 5.1 Define the event union — prose delta, tool activity, terminal map payload, error — and its
      SSE encoder; include unit tests that each variant encodes and parses back unchanged.
- [x] 5.2 Wire the loop into the stream so prose deltas and tool activity are emitted as they occur;
      include unit tests on ordering: a tool's start precedes its completion, and the terminal
      payload is last with nothing after it.

## 6. The map payload

- [x] 6.1 Implement the projection from the tool results the request collected, with no input from
      the assistant's output; include unit tests that a turn covering NAP-09 and NAP-12 yields
      margins of exactly -1.40 and 2.77, and that a turn calling no tools yields no entries and does
      not ask the map to reframe.

## 7. The route handler

- [x] 7.1 Implement `POST /api/chat` returning the stream, configured for `claude-opus-5` with
      summarised thinking display, a low or medium effort setting and streaming enabled; verify by
      asking a question through the endpoint and watching prose arrive incrementally.
- [x] 7.2 Report an upstream failure that occurs after streaming has begun as an error event rather
      than a truncated stream; include a unit test driving a failing stream fixture.

## 8. The chat surface

- [x] 8.1 Add a page with an input, a running transcript and text rendered as it arrives; verify in
      the browser that an answer appears progressively and earlier exchanges stay visible.
- [x] 8.2 Consume tool-activity events to show what the assistant is doing while no prose exists
      yet, and log the map payload without drawing it; verify that the survey's round trip is no
      longer a blank screen.

## 9. Close-out

- [x] 9.1 Verify by hand, once, the two behaviours no test covers: that the assistant surveys before
      detailing, and that asking for ONT receiver sensitivity produces an explicit "not available"
      rather than an invented figure. Record both transcripts in the change before archiving.
- [x] 9.2 Document the assistant in `README.md` (in English) — the two tools, that the model never
      computes, that the map payload is projected server-side, and that the tests never call the
      API; verify by reading it back against the proposal's Why.
- [x] 9.3 Run `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build`, and verify all four
      pass clean.
