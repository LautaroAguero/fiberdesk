# Verification — add-subscriber-trace

Checks that unit tests cannot cover, run by hand and recorded here.

## Task 2.3 — the map, with replayed turns (no API)

Dev server `fiberdesk-dev`, on 2026-10-12. Each turn was replayed by overriding `fetch` for
`/api/chat` with a recorded SSE body (the technique in
`openspec/changes/archive/2026-09-22-add-map-copilot/LOOP.md`), so no model was called.

- **(a) The reference payload:** NAP-12 `marginal` with FR-03 and FR-12, and NAP-09 `fail` with
  FR-04 and FR-09. NAP-12's path is painted in the marginal colour and NAP-09's in the fail colour,
  and the view reframes on both, as before the payload change.
- **(b) A traced subscriber:** SUB-025 `marginal` at 1.85, with FR-03 and FR-12 `marginal`. SUB-025
  is drawn in the marginal colour and at a larger radius. The path FR-03 → FR-12 is marginal, NAP-12
  stays neutral, and the previous turn's NAP-09 path is cleared. The view reframes to include
  SUB-025 and the OLT. Screenshot: `screenshots/2.3-traced-subscriber-replay.jpg`.
- **(c) Clear highlight:** every run and the subscriber return to the neutral style.
- **(d) Console:** no errors.

## Re-grading recorded runs

`npm run eval:regrade -- evals/runs/2026-10-12T11-08-31Z.json` (B2) after groups 1–4 gives 17/21,
with no case changing outcome. Four cases are kept as recorded instead of re-graded:
`abstain-ont-es`, `docs-attenuation-en`, `docs-attenuation-es` and `docs-connector-es`. The cause is
that `get_optical_constants` now also returns the two drop constants (task 3.3), so its result no
longer matches the hash stored for what the model saw. That is the re-grader's designed behaviour
(add-eval-harness, decision 15). Those four outcomes stand as graded when they ran.

## Task 5.1 — smoke run of the trace cases

`evals/runs/2026-10-12T13-58-16Z.json`, with prompt `42029e23335b`. The run passed 7/7 and spent
$0.1498.

- Every `trace_subscriber_link` call names a valid subscriber, and every payload holds only the
  subscriber entry.
- After the run's very first call, every call read the cached prefix (3,337 tokens on a first call,
  ~3,430 on a second).

Hand reading of the three answers no grader fully reads:

- `trace-unknown-es`: says SUB-099 does not exist and makes no call.
- `trace-ont-verdict-es`: says the system cannot tell whether the ONT will work, because receiver
  sensitivity is not modelled. It states no threshold and reports only the classification and the
  estimated power.
- `trace-nap06-es`: says the NAP passes but the subscriber is marginal, with the tool's 3.44 and
  2.52.

## Task 5.2 — full runs

### First full run: a substitute call

`evals/runs/2026-10-12T13-59-34Z.json`, with prompt `42029e23335b` and $0.6259 spent. As run it
scored 23/28; re-graded after the placeholder fix below, it scores 24/28. Two findings:

- **`trace-unknown-es` traced SUB-001 for a question about SUB-099.** Its prose said SUB-099 does
  not exist, and even that it would not substitute another subscriber, but the call had already
  put SUB-001 on the map. This breaks the spec ("SHALL NOT call a tool with a substitute
  identifier"). The fix puts the system prompt's rule into the tool description, the text the model
  reads when it chooses the tool (`8e971b7`), with a test. The prompt hash changed, so the full run
  was repeated.
- **`abstain-vendor-es` failed on a grader false positive.** The decline wrote "SUB-0XX" to describe
  the identifier format, and the grounding grader read its `0` as a figure. Placeholders of the form
  `SUB-0XX` are now masked as identifiers (`c561c9a`), with a test. Re-graded offline, the case
  passes, and B1's and B2's outcomes are unchanged.

### Second full run: the result of record

`evals/runs/2026-10-12T14-05-31Z.json`, with prompt `c20ecc7407bf`, $0.6287 spent and 23/28 overall
(82.1%, 95% interval 64.4–92.1%).

| Area | Passed |
|---|---|
| trace | 7/7 (64.6–100.0%) |
| abstention | 5/5 |
| docs | 5/5 |
| budget | 5/8 |
| conversation | 1/3 |

Per question, the cold median is $0.0385 and the measured median $0.0190, with p95 measured
$0.0428 and p95 latency 12.1 s.

`eval:compare` against B2 on the 21 existing cases: pass → fail 2, fail → pass 1, McNemar p = 1.00.

- **`budget-failing-es`** (pass → fail; stable in B1 and B2). The answer is correct and every
  budget figure comes from the two detail calls, but it writes "20.8 km de fibra": 12 + 8.8,
  summed by the model. This is the known weakness of arithmetic in prose (B1 and B2 summed hop
  lengths in other cases). The turn never calls the trace tool.
- **`conv-and-nap12-es`** (pass → fail). It was already unstable between B1 and B2. Its "67" (a
  share of the loss) and "20" (km) are arithmetic in prose.
- **`budget-rx-nap09-es`** (fail → pass). It now fetches the NAP-09 detail and states −26.4 dBm.

No regression traces to the trace tool, the payload or the prompt paragraph. Every new failure is
arithmetic in prose, which the separate prompt change is for.

**The noise is wider than one case in 21.** The two full runs above differ only in the trace tool's
description, a change that does not touch the 21 existing cases' turns. Even so, those cases score
19/21 in the first run (re-graded) and 16/21 in the second, against 16 and 17 for B1 and B2. The
one-case noise floor from B1/B2 understated how much a single run moves: between two runs of
nearly the same configuration, the old cases moved by three.

## Task 5.3 — the app, live

Dev server `fiberdesk-dev`, on 2026-10-12, real API. The question asked was "¿por qué el abonado
SUB-025 tiene poca señal?".

- **Streaming:** the answer streams, after one `trace_subscriber_link` call. The server log line
  `assistant_turn` shows 2 iterations, 7,698 cache-read tokens (both calls read the prefix) and
  $0.0196.
- **Figures:** every figure in the answer is in the tool result: 26.15 / 1.85 / −23.15, the four
  by-source losses, the two hops with their lengths and losses, NAP-12's 25.23 / 2.77, and the drop
  of 0.92 dB (0.383 km × 1.3 = 0.498 km). It calls the drop and the received power estimates, and
  says it cannot tell whether the ONT will work.
- **Map:** SUB-025 and FR-03 → FR-12 are painted marginal and the view reframes. Screenshot:
  `screenshots/5.3-live-sub-025.jpg`.
