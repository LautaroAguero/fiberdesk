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
