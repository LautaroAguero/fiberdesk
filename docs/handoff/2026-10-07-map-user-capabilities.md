# Handoff: map-user capabilities and an eval suite

Date: 2026-10-07 · From: the AI-engineering review session · To: the FiberDesk session

Read `CLAUDE.md` first. Every rule there still holds: the model orchestrates and the code
calculates, spec before code (one OpenSpec change per item below, via `/opsx:propose`), synthetic
data only, repository artifacts in English. Nothing here authorizes skipping a spec.

## Why this change of direction

FiberDesk answers one question well today — "which NAPs fail the optical budget?" — plus
documentation lookups. That is a network *designer's* question. The people who actually use an ISP
infrastructure map (sales, NOC, field planning) ask other things, every day. The owner has built
ISP network-map software in production for about three years and picked the three questions that
matter most:

1. **Subscriber fiber trace** — "¿por dónde pasa la fibra del cliente SUB-014 y con cuánta potencia llega?"
2. **Cut impact** — "si se corta FR-03, ¿a quién afecta?"
3. **Feasibility** — "¿puedo conectar un cliente acá?" (a point clicked on the map)

The second gap is measurement. The README states it plainly: *this project has no evals*. Eight
behaviours were verified by hand once and nothing watches them. Adding three capabilities without
an eval would triple that debt. So the eval comes first, and every capability change ships with
its own eval cases.

## Current state, verified 2026-10-07

Facts the proposals should build on — checked in the code, not recalled:

- **Four tools** in `src/lib/assistant/tool-definitions.ts`, all `strict: true`, NAP ids as an enum
  built from the network. No `tool_choice` is set anywhere (relevant for the model question below).
- **The highlight is NAP-only.** `HighlightPayload` (`src/lib/assistant/events.ts`) is
  `{ highlight: { nap_id, status, margin_db }[], fit_bounds }`, and `projectHighlight`
  (`src/lib/assistant/highlight.ts`) only projects `detail_optical_budget` results. It cannot
  express a subscriber, a set of affected runs, or a clicked point.
- **The route receives only `messages`** (`src/app/api/chat/route.ts`). There is no map context in
  the request, although `CLAUDE.md`'s reference flow says "historial + pregunta + estado del mapa".
- **The map is clickable only on NAPs** (`NetworkMap.tsx`, layer `naps-circle`).
- **No instrumentation.** `src/lib/assistant/loop.ts` never reads `message.usage`; no tokens,
  latency or cost are recorded per call or per turn.
- **Model:** `claude-opus-5` ($5 / $25 per MTok), effort `low`, adaptive thinking. `claude-opus-5-5`
  exists at $4 / $20 (verified against the claude-api skill's model table, cached 2026-09-25).
- **Topology:** two cascades, `NAP-12 <- NAP-03` and `NAP-09 <- NAP-04`; 12 fiber runs, 28
  subscribers.
- **Port occupancy** (outputs − subscribers − child NAPs fed), computed from the seed:
  NAP-03 (1:2) has **0 free ports** — one subscriber plus the output feeding NAP-12. NAP-10 (1:4)
  has 2. NAP-09 has 5 free ports but **fails** its budget. The seed already contains the edge cases
  feasibility needs, before any edit.

## The plan: four OpenSpec changes, in this order

| # | Change | Why in this position |
|---|---|---|
| 0 | `add-eval-harness` (with per-call instrumentation) | A baseline of today's behaviour before anything changes. Without it, no later claim of "still works" means anything. |
| 0b | `reduce-cost-per-question` | Owner goal: half the cost per question. Done right after the baseline, so the three capabilities are built and evaluated on the model they will ship with. |
| 1 | `add-subscriber-trace` | Smallest capability. Introduces the **drop model** and the **generalized highlight payload**, which the other two reuse. |
| 2 | `add-cut-impact` | Downstream traversal of a tree that already exists. Cheap, and exercises the generalized payload on sets of entities. |
| 3 | `add-feasibility` | The most valuable and the most complex: map context in the request, capacity, distance, and the drop model together. Goes last so it lands on solid ground. |

Each change: proposal → owner approves the spec → code → eval cases added → one recorded live run
(as in the previous phases' `verification.md`) → README section updated with its numbers.

---

### Change 0 — `add-eval-harness`

**Instrumentation (prerequisite).** The loop records, per model call: model, input / output /
cache-read / cache-write tokens from `message.usage`, latency, and cost computed from a pricing
table in config (with the date the prices were verified). Per turn: the sum, the number of
iterations and the tool trajectory. The app logs this server-side; the eval runner persists it.

**Runner.** `npm run eval` (separate from `npm test`, which must never call the API). Cases live in
`evals/cases/`, run records in `evals/runs/<timestamp>.json` (committed): model, prompt hash,
per-case pass/fail per grader, tokens, cost, latency. A mandatory spend cap, checked before each
case.

**Graders — deterministic first** (course 15.4, level 1). No LLM judge in this change.

- **Trajectory:** required tools were called, and in the required order where it matters (survey
  before detail).
- **Highlight vs oracle:** the set of entities in the projected payload equals the set the engine
  says is correct for that case.
- **Number grounding:** every number in the final text appears in some `tool_result` of that turn
  (allowing the Spanish decimal comma, and ignoring identifiers like `NAP-12` and ratios like
  `1:16`). This turns the project's core rule into an automatic check. **Validate the grader by
  hand on ~15 real answers before trusting it** (15.6): a grounding check with false positives is
  worse than none.
- **Abstention:** for "should decline" cases (ONT sensitivity, a NAP that does not exist,
  out-of-domain), there is an empty highlight and no ungrounded numbers. If that proves too weak,
  a calibrated judge comes in a later change, not this one.

**Cases.** Start by converting the eight hand-verified behaviours from the archived
`verification.md` files, plus Spanish phrasings and one multi-turn follow-up ("¿y la NAP-12?").
This change writes the ~20 cases for today's behaviours. Each capability change adds its own ~20,
for ~80 in total (owner decision 4, with the numbers behind it).

**Baseline run** on the current model. That is the first number the README gets.

**Run the baseline twice** on the same model. The number of cases that flip between two runs of
the *same* configuration is the pure-noise level of discordance. Change 0b needs it to tell a real
model difference from non-determinism, and any case that flips is flagged as unstable.

---

### Change 0b — `reduce-cost-per-question`

**Goal (owner, 2026-10-07):** median cost per question at or below **50% of the baseline**,
measured from the eval's run records, not estimated.

**Decision rule — fixed before any comparison run, not after seeing results:**

- **Veto:** any case that passes the grounding or abstention grader in the baseline and fails it
  in the candidate rejects that candidate. Those graders encode the project's hard rules; a cheaper
  model that invents a number is not cheaper, it is broken.
- **Quality:** the paired difference against the baseline (exact McNemar, `/eval-stats pareado`)
  is not significant, its point estimate loses at most 5 points, and no single area accumulates 3
  or more new failures.
- **Every discordant case is read by hand** before the decision, not just counted.
- Honest limit, stated in the README: with ~80 cases this rule does not *prove* the loss is under
  5 points (the interval of the difference is wider than that). It is a pragmatic rule backed by
  the vetoes, not a non-inferiority proof.

**Levers, in this order — each one is a paired run against the baseline, kept only if it passes:**

1. **Prompt caching (free win, no behaviour change).** Verified 2026-10-07: there is no
   `cache_control` anywhere in `src/`. The prefix (four tool definitions plus the system prompt)
   is byte-stable across requests, and the loop resends it on every iteration of a turn (survey,
   then detail, then the answer), plus the growing history. Mark it, confirm with `count_tokens`
   that it clears the model's minimum cacheable prefix (512 tokens on Opus 5 / Opus 5.5 /
   Sonnet 5.5 per the claude-api skill), and verify `cache_read_input_tokens > 0` in the run
   records. If it stays at zero, something in the prefix is varying, and that is a bug to find.
2. **`claude-opus-5` → `claude-opus-5-5`.** Same tier, list price $5 / $25 → $4 / $20. Read the
   migration notes via the `claude-api` skill first: thinking cannot be disabled (already adaptive
   here), forced `tool_choice` returns 400 (not used here), and the effort default changes
   (already set explicitly).
3. **`claude-sonnet-5-5`** ($2 / $10 list). Try effort `low` and `medium`: the skill notes Sonnet
   5.5's effort levels are recalibrated. This is the lever that can reach the 50% target on its
   own *if* token counts per question stay similar, and that is exactly what has to be measured.
   Thinking and tool-call patterns differ between models.

Not in this round: Haiku 4.5. It is an older generation with a different thinking configuration
and a 4096-token cache minimum, so the free win of lever 1 likely disappears. Revisit only if
Sonnet passes with room to spare.

**Deliverable:** a README table with each configuration, its median and p95 cost per question,
p95 latency, pass rate with interval, and the McNemar result against the baseline, plus the choice
and why. The losing configurations stay in the table: they are the evidence for the decision.

---

### Change 1 — `add-subscriber-trace`

**Engine** (pure TypeScript, unit-tested against a hand-derived oracle, like
`seed/expected-budgets.json`): for a subscriber, it returns the path OLT → … → serving NAP → drop →
ONT. That includes the per-hop breakdown already produced by `calculateBudget` for the NAP, plus
the drop contribution, total loss, margin against the GPON class budget, and estimated received
power at the ONT.

**Drop model (shared with feasibility):** drop length = straight-line distance NAP→subscriber ×
a slack factor; drop loss = length × fiber attenuation + the connectors a drop adds. Every new
value goes in `src/lib/optical/constants.ts` with unit, source and **pending validation**, exactly
like the existing constants, and the README names it as an assumption, not data. ONT receiver
sensitivity stays unmodelled: the trace classifies against the class budget and must not claim
the ONT "will work".

**Tool:** `trace_subscriber` (or a name that describes the shape of the answer, per the existing
naming rule), `subscriber_id` as an enum from the network (28 values).

**Highlight:** the subscriber plus every run on its path. This is where `HighlightPayload` gets
generalized. Recommendation: typed entries per entity kind (`nap`, `subscriber`, `run`, later
`point`), still projected in code from tool results, never emitted by the model. It is a breaking
contract change for `resolveHighlight` and the map, so it needs its own requirement in the spec.

**Eval cases:** a cascaded subscriber (one on NAP-12), a direct one, a subscriber on the failing
NAP-09, a non-existent id, and a by-name lookup ("el cliente Subscriber 014").

**Scale limit to document:** the enum works for 28 subscribers. At real-ISP scale (thousands) it
needs a lookup tool instead. State this in `design.md`; do not build it.

---

### Change 2 — `add-cut-impact`

**Engine:** given a fiber run or a NAP, it returns everything downstream: affected NAPs
(including through cascades), affected subscribers, and the count. It is a pure traversal of the
`parent` tree. Hand-derived oracle in the seed folder. Expected values to cross-check: cutting
FR-03 takes NAP-03 and NAP-12 (5 subscribers); cutting FR-12 takes only NAP-12 (4); cutting FR-04
takes NAP-04 and NAP-09 (5).

**Tool:** `element_id` as an enum of fiber runs and NAPs. The OLT is excluded (owner decision 3).

**Highlight:** the cut element, plus the affected subtree in a distinct status.

**Eval cases:** cut on a feeder that has a cascade, cut on a leaf run, cut on a NAP, a
non-existent element, and a follow-up "¿cuántos clientes son?" that must come from the tool's
count and not from the model counting a list.

---

### Change 3 — `add-feasibility`

**Map context.** A click on empty map space sets a selected point (a visible marker); clicking a
NAP keeps opening its breakdown. The request body gains `map_context: { selected_point?: {lat, lon} }`,
validated in the route (inside the modelled city's bounds, like the network loader validates
coordinates).

**Key design decision — recommended:** the tool takes **no coordinates as arguments**. The
dispatcher reads the point from the request context. Making the model copy coordinates out of the
conversation would be the same mistake `projectHighlight` was built to avoid ("copying is where a
model writes 2.7 for 2.77"). With no point selected, the tool returns an error that tells the
model to ask the user to click the map. How the model learns that a point is selected (for
example, a short marker appended to the user turn by the route) is for `design.md`.

**Engine:** candidate NAPs within a maximum drop distance of the point. For each one: free ports
(outputs − subscribers − child NAPs fed; owner decision 1), drop estimate (the
model from change 1), and projected budget at the new subscriber. The result is sorted with
feasible candidates first, and each infeasible one carries a reason: `no_free_ports`,
`budget_fail` or `too_far`. Distance, capacity and budget are all deterministic. The model picks
the tool and explains the result.

**Highlight:** the point, the candidate NAPs coloured by feasibility, and optionally the drop line
to the best one.

**Eval cases (the seed already provides them):** the nearest NAP has no free ports (near NAP-03);
the nearest has ports but fails the budget (near NAP-09); a comfortable case; a point out of
coverage; no point selected; a follow-up "¿y si lo conecto a la segunda opción?".

---

## Out of scope for these four changes

Write actions on the network (assigning ports, editing elements: that is an agent with
confirmation and audit, a different scope), address geocoding, real data of any kind, several
OLTs, what-if planning, deploy.

## Owner decisions (2026-10-07)

1. **Feeding a child NAP consumes one output of the parent splitter.** Free ports = outputs −
   subscribers − child NAPs fed. That is what makes NAP-03 full.
2. **Drop model: industry-typical values**, in `constants.ts` with unit, a cited source and
   **pending validation**, like every other constant. Suggested starting points, to be confirmed
   against a source in `design.md` rather than copied from here: slack factor ~1.3 over straight
   line, 2 connectors per drop (NAP port and ONT, reusing the existing connector loss), and a
   maximum drop distance around 300 m. Fiber attenuation reuses the existing constant.
3. **A cut at the OLT is not a valid input** for cut impact. `element_id` covers fiber runs and
   NAPs only. Asking about the OLT gets a plain "not supported" from the tool, and the model says so.
4. **Eval size: ~80 cases** (about 20 per area: today's behaviours plus each of the three
   capabilities). Computed with `/eval-stats` at an assumed 85% pass rate:

   | n | 95% Wilson interval | noise floor of one run |
   |---|---|---|
   | 20 | 64.0%–94.8% | ±15.6 pts |
   | 40 | 70.9%–92.9% | ±11.1 pts |
   | 80 | 75.6%–91.2% | ±7.8 pts |

   For the paired model comparison (same cases, exact McNemar), a 10-point drop is **not**
   significant at n=40 (5 vs 1 discordant: p = 0.22), but is at n=80 (10 vs 2: p = 0.039). With
   fewer than 6 discordant cases no difference can be significant, so the set needs hard cases,
   not 80 easy ones. Per-area figures (n≈20) are reported with their interval, not as headlines.

## Definition of done for this whole handoff

- The README's "this project has no evals" line is replaced by a table: pass rate per capability
  with its n and interval, plus cost and p95 latency per question, all from a committed run
  record.
- Three new capabilities, each with a spec, a hand-derived oracle, unit tests that never call the
  API, eval cases and a recorded live run.
- Median cost per question at or below 50% of the baseline, or a documented explanation of why no
  candidate passed the decision rule in change 0b, with the comparison table committed.
