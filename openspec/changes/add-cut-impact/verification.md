# Verification — add-cut-impact

Checks that unit tests cannot cover, run by hand and recorded here.

## Task 2.3 — the map, with replayed turns (no API)

Dev server `fiberdesk-dev`, on 2026-10-12. Each turn was replayed by overriding `fetch` for
`/api/chat` with a recorded SSE body, so no model was called.

- **(a) The FR-03 cut.** FR-03 `cut`; NAP-03, NAP-12, SUB-006, SUB-025–028 and FR-12
  `out_of_service`.
  - FR-03 is drawn in magenta and wide.
  - FR-12 is drawn wide and near-black. NAP-03, NAP-12 and the five subscribers are drawn in dark
    slate.
  - Every other NAP, run and subscriber stays neutral, and the view reframes on the subtree.
  - Screenshot: `screenshots/2.3-cut-fr03-replay.jpg`.
- **A style fix found here.** The first version drew dark runs at the neutral width and 0.4
  opacity. On the light base map, that slate washed out to the neutral fiber grey (`#64748b`), so a
  dark run could not be told apart from an unaffected one, which the spec requires. Dark runs now
  use a path's width (4) and 0.85 opacity. Design.md, decision 6, records the change.
- **(b) The reference payload** (NAP-12 `marginal` and NAP-09 `fail` with their runs) still paints
  both paths in their budget colours, and replaces the cut.
- **(c) Clear highlight** returns every NAP, run and subscriber to neutral.
- **(d) Console:** no errors.
