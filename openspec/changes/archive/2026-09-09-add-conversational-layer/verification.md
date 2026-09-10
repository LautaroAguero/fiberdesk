# Manual verification (task 9.1)

Two behaviours no unit test can cover — see design.md, decision 9. Verified once, by hand,
against the real API. If either regresses later, nothing will notice automatically.

## 1. Survey before detail (confirmed)

Live run, `claude-opus-5`, against the committed seed.

> **You:** which NAPs fail the optical budget?
>
> **FiberDesk:** I'll check the whole network first.
>
> **One NAP fails:**
> - **NAP-09 — Barrio Los Silos**: 29.40 dB total loss, margin **−1.40 dB**
>
> Worth watching, though not failing:
> - **NAP-12 — Barrio Güiraldes**: 25.23 dB, margin **2.77 dB** — marginal (below the 3.00 dB
>   recommended minimum)
> - **NAP-06 — Villa Prosperidad**: 24.56 dB, margin **3.44 dB** — passes, but with little
>   headroom
>
> All other NAPs pass. Let me know if you'd like a loss breakdown for NAP-09 or NAP-12 to see
> which span or splitter is responsible.
>
> **You:** I like a loss breakdown for NAP-09 or NAP-12 to see which span or splitter is
> responsible.
>
> **FiberDesk:** Both are cascades off an upstream NAP, and in both cases splitters — not fiber —
> dominate.
>
> **NAP-09 — Barrio Los Silos (fail, margin −1.40 dB)**
> - Budget: GPON B+, 28 dB; total loss 29.40 dB; Rx power −26.40 dBm
> - By source: splitters **21.00 dB**, fiber **5.20 dB**, connectors **2.40 dB**, splices
>   **0.80 dB**
> - Hops:
>   - FR-04, OLT-RES-01 → NAP-04, 12 km: fiber 3.00 dB, plus the **inherited 1:8 splitter at
>     NAP-04, 10.50 dB**, connectors 1.20 dB, splices 0.48 dB
>   - FR-09, NAP-04 → NAP-09, 8.8 km: fiber 2.20 dB, **1:8 splitter at NAP-09, 10.50 dB**,
>     connectors 1.20 dB, splices 0.32 dB
>
> Responsible: the two cascaded 1:8 splitters, 21.00 dB combined. Fiber over 20.8 km contributes
> only 5.20 dB.
>
> **NAP-12 — Barrio Güiraldes (marginal, margin 2.77 dB)**
> - Total loss 25.23 dB; Rx power −22.23 dBm
> - By source: splitters **17.00 dB**, fiber **4.95 dB**, connectors **2.40 dB**, splices
>   **0.88 dB**
> - Hops:
>   - FR-03, OLT-RES-01 → NAP-03, 11.2 km: fiber 2.80 dB, inherited **1:2 splitter at NAP-03,
>     3.50 dB**, connectors 1.20 dB, splices 0.48 dB
>   - FR-12, NAP-03 → NAP-12, 8.6 km: fiber 2.15 dB, **1:16 splitter at NAP-12, 13.50 dB**,
>     connectors 1.20 dB, splices 0.40 dB
>
> Responsible: the 1:16 splitter at NAP-12 alone, 13.50 dB — over half the total.
>
> *(UI activity log: "✓ Pulling the detailed breakdown" ×2 — both detail calls landed in the
> same assistant turn, confirming they ran in parallel rather than one after the other.)*
>
> *(Terminal payload: "Map highlight logged to the console — drawing it is Phase 3. NAPs: NAP-09,
> NAP-12." — the highlight held exactly the two NAPs that were detailed, not all twelve from the
> survey.)*

**Cross-checked against the engine by hand — every figure matches exactly:**

| | Reported | Recomputed |
|---|---|---|
| NAP-09 total / margin | 29.40 dB / −1.40 dB | 29.40 / −1.40 |
| NAP-09 by-source | splitters 21.00, fiber 5.20, conn 2.40, splices 0.80 | identical |
| NAP-09 hop FR-04 | fiber 3.00, conn 1.20, splices 0.48 | identical |
| NAP-09 hop FR-09 | fiber 2.20, conn 1.20, splices 0.32 | identical |
| NAP-12 total / margin | 25.23 dB / 2.77 dB | 25.23 / 2.77 |
| NAP-12 by-source | splitters 17.00, fiber 4.95, conn 2.40, splices 0.88 | identical |
| NAP-12 hop FR-03 | fiber 2.80, conn 1.20, splices 0.48 | identical |
| NAP-12 hop FR-12 | fiber 2.15, conn 1.20, splices 0.40 | identical |

Confirms: the survey ran first and covered all 12 NAPs before any detail call; the two detail
calls that followed landed in one turn and ran in parallel; every stated figure matches the
engine's output to the reported precision; the map payload was limited to the two NAPs actually
detailed, never the full census.

## 2. Declining rather than inventing (confirmed)

Same live session, asked in Spanish as a follow-up to the exchange above.

> **You:** ¿cuál es la sensibilidad del receptor del ONT?
>
> **FiberDesk:** La sensibilidad del receptor del ONT **no está disponible en este sistema** — es
> un valor que el proyecto deliberadamente no modela, así que no tengo forma de dártela ni de
> deducirla.
>
> Lo que sí calculan las herramientas son los presupuestos ópticos contra el **presupuesto de
> clase GPON**, que en estos enlaces es clase **B+ con 28 dB** de presupuesto, aplicando un margen
> mínimo recomendado de 3.00 dB. Por eso NAP-09 aparece con 29.40 dB de pérdida y margen −1.40 dB
> (Rx −26.40 dBm), y NAP-12 con 25.23 dB y margen 2.77 dB (Rx −22.23 dBm).
>
> Si necesitás la sensibilidad real del receptor, tendrás que sacarla de la hoja de datos del
> modelo de ONT instalado; no es un dato que yo pueda leer de esta red.

Confirms: no sensitivity figure was invented; the assistant named exactly what it does not have
and why (a deliberate project scope decision, not a missing feature); it redirected to what the
tools actually compute instead of guessing; and the NAP-09 / NAP-12 figures it repeated from the
prior turn (29.40 / −1.40 / −26.40 and 25.23 / 2.77 / −22.23) are unchanged and still exact —
no drift across turns.

## Result

Both behaviours confirmed against the live API. Task 9.1 is complete.
