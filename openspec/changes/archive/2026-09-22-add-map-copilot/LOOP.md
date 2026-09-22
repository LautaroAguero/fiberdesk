# Implementation loop — add-map-copilot

Handoff for the agent that implements this change. Written so a fresh session, with no memory of
the planning conversation, can run it end to end. The plan is fixed: do not redesign, implement.

## Read first (in this order)

1. `CLAUDE.md` — the project rules. The one that matters most here: **the model reasons, the code
   calculates.** No figure on the map may come from anywhere but the budget engine.
2. `openspec/changes/add-map-copilot/proposal.md` — scope and **non-goals**. Anything in non-goals
   is out, even if it looks easy.
3. `openspec/changes/add-map-copilot/specs/network-map/spec.md` — the contract. Scenario numbers
   are test values.
4. `openspec/changes/add-map-copilot/design.md` — how. Decisions 1–7 are settled.
5. `openspec/changes/add-map-copilot/tasks.md` — the work queue.

Code you will touch or read: `src/app/page.tsx`, `src/app/layout.tsx`,
`src/lib/assistant/events.ts` (`HighlightPayload`), `src/lib/assistant/stream.ts`,
`src/lib/network/types.ts`, `src/lib/network/load.ts`, `src/lib/optical/budget.ts`
(`BudgetResult`, `calculateAllBudgets`), `seed/network.json`, `seed/expected-budgets.json`.

## Facts that are easy to get wrong

- Payload fields are `nap_id` and status `"pass" | "marginal" | "fail"`. `CLAUDE.md`'s example says
  `id` / `"warning"` — **the code is right, the example is illustrative.**
- `FiberRun.geometry` is `[lon, lat]`. Nodes have `lat`/`lon` fields. MapLibre wants `[lon, lat]`.
- The path to a NAP comes from `BudgetResult.hops[].run_id`. Do not re-walk the tree.
- `src/lib/network/load.ts` uses `node:fs`: import it only from server code (`page.tsx` as a
  server component), never from a `"use client"` file.
- Vitest runs in `node` and only picks up `src/**/*.test.ts`. Do not add jsdom or component tests.
- Reference figures: NAP-12 total 25.23, margin 2.77, marginal, hops FR-03 (1:2) → FR-12 (1:16);
  NAP-09 total 29.40, margin -1.40, fail, hops FR-04 → FR-09; NAP-03 total 7.98, margin 20.02, pass.

## Hard rules

- **Never call the Anthropic API.** Not in tests, not in the browser. Browser checks replay a fake
  SSE response (below). Do not start task 7.1 — it is done by hand.
- Stay on branch `add-map-copilot`. **Never push, never merge, never touch `main`.**
- Code, comments and commit messages in English. Match the surrounding comment style: files open
  with a doc comment explaining *why*, pointing to design.md decisions.
- Do not edit `openspec/specs/` (main specs) or archive the change.
- Do not change the route handler, tools, loop, system prompt or `HighlightPayload`.

## The loop

Repeat until no unchecked task remains in groups 1–6, then do 8.1:

1. Open `tasks.md`, take the **first** unchecked task (`- [ ]`) in groups 1–6 (or 8).
2. Implement exactly that task.
3. Run `npm test`, `npm run lint`, `npx tsc --noEmit`. Fix until all three pass.
4. If the task says to verify in the browser, do it (see below).
5. Tick it in `tasks.md` (`- [x]`) and commit code + tasks.md together:
   `git commit -m "feat(map): <task id> <short summary>"` ending with the line
   `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
6. Next task.

**Stop and report instead of guessing** when: the same task fails its checks three attempts in a
row; a task seems to require changing something the hard rules forbid; or the spec and the code
disagree in a way the "Facts" above do not settle. Leave the task unchecked and describe the
blocker.

## Browser verification

Dev server: the `fiberdesk-dev` configuration in `.claude/launch.json` (`npm run dev`, port 3000).
Start it with the preview tool, never with a shell command. Use `read_console_messages` for errors,
`javascript_tool` to inspect, `screenshot` for proof. If browser tools are not available in your
session, do everything else, leave browser-only tasks (4.x checks, 5.2 check, group 6) unchecked
and say so in the report.

To inspect map state: expose nothing new in product code. Query it through MapLibre's canvas
container if needed, or rely on screenshots plus `read_page` for the breakdown card text.

### Replaying a turn (no API)

Run this in the page via `javascript_tool` **before** submitting a question. Change `payload` per
task (6.2 empty, 6.3 with `NAP-99`).

```js
(() => {
  const payload = {
    highlight: [
      { nap_id: "NAP-12", status: "marginal", margin_db: 2.77 },
      { nap_id: "NAP-09", status: "fail", margin_db: -1.40 },
    ],
    fit_bounds: true,
  };
  const question = "which NAPs fail the optical budget?";
  const events = [
    { type: "text", text: "Two NAPs need attention: " },
    { type: "text", text: "NAP-09 fails and NAP-12 is marginal." },
    { type: "done", payload, messages: [
      { role: "user", content: question },
      { role: "assistant", content: [{ type: "text", text: "Two NAPs need attention." }] },
    ] },
  ];
  const body = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  const realFetch = window.__realFetch ?? window.fetch.bind(window);
  window.__realFetch = realFetch;
  window.fetch = (input, init) =>
    String(input).includes("/api/chat")
      ? Promise.resolve(new Response(body, { headers: { "Content-Type": "text/event-stream" } }))
      : realFetch(input, init);
  return "replay armed";
})();
```

## Final report

When done or stopped: list tasks completed (with commit hashes), tasks left and why, final test
count, and the screenshots from 6.1 and 6.4. Remind that 7.1 (real-API run) is pending by hand.
