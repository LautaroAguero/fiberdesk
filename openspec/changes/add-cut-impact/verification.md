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

## Task 5.1 — smoke run of the cut cases

`evals/runs/2026-10-12T17-11-26Z.json`, with prompt `30844d48a2b6`. The run passed 6/6 and spent
$0.1399.

- Every `list_cut_impact` call names the element the question asked about (FR-03, FR-12, NAP-04,
  FR-04). None names the OLT or a substitute.
- The payloads hold exactly the oracle sets, with the cut element and everything out of service.

Hand reading of the declines, which the abstention grader only checks for highlights and figures:

- **`cut-olt-es`:** says a cut at the OLT is not supported by the tool, and that it therefore
  cannot say how many NAPs or subscribers would be affected. It makes no call and gives no count.
- **`cut-unknown-es`:** says FR-99 does not exist and that the runs go from FR-01 to FR-12. It
  computes nothing and makes no `list_cut_impact` call. It did call `search_documentation` first,
  which is harmless: no highlight, no figure.
- **`cut-count-followup-es`:** the follow-up answers "5 suscriptores", the count the FR-04 call
  returned, and lists the five ids.

## Task 5.2 — full run

`evals/runs/2026-10-12T17-12-15Z.json`, with prompt `30844d48a2b6` and $0.6279 spent. Overall it
scored **30/34 (88.2%, 95% interval 73.4–95.3%)**.

| Area | Passed |
|---|---|
| cut | 6/6 (61.0–100.0%) |
| trace | 7/7 |
| abstention | 5/5 |
| docs | 5/5 |
| budget | 5/8 |
| conversation | 2/3 |

Per question, the cold median is $0.0410 and the measured median $0.0157, with p95 measured
$0.0395 and p95 latency 10.7 s. The 21 older cases pass 17/21.

`eval:compare` against add-subscriber-trace's run of record
(`2026-10-12T14-05-31Z.regraded.json`): no case goes pass → fail, and `conv-and-nap12-es` goes
fail → pass (McNemar p = 1.00). The four failures are all older cases, and every one is a known
weakness:

- **Stopping at the survey:** `budget-failing-en` and `budget-failing-es` answer correctly from
  the survey, but offer the breakdown instead of fetching it, so nothing is highlighted.
  `budget-failing-es` failed in the previous record too, for arithmetic in prose; its outcome is
  unchanged.
- **Arithmetic in prose:** `budget-why-nap12-es` ("20" km) and `conv-second-one-en` ("19.8").

None of them calls the cut tool. No regression traces to this change.

## Task 5.3 — the app, live

Dev server `fiberdesk-dev`, on 2026-10-12, real API. The question asked was "¿qué pasa si se corta
el tendido FR-03?".

- **Streaming:** the answer streams after one `list_cut_impact` call. The server log line shows 2
  iterations, 9,304 cache-read tokens (both calls read the prefix) and $0.0114.
- **Figures:** "2 NAPs" (NAP-03, and NAP-12 through the cascade), "5 suscriptores" with their ids,
  and "1 tendido aguas abajo" (FR-12): the three counts the tool returned. It calls the cut total
  and hypothetical, with no partial damage, rerouting or repair time.
- **Map:** FR-03 is painted in the cut style and the subtree dark, and the view reframes.
  Screenshot: `screenshots/5.3-live-cut-fr03.jpg`.
