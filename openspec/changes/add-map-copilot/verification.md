# Manual verification (task 7.1)

The two behaviours no unit test can cover — see design.md, Risks/Trade-offs. Verified once, live,
against the real API (`claude-opus-5`), driving the actual map page in a browser rather than
calling the API directly. Everything else in `tasks.md` was verified with replayed turns and no API
call at all (group 6). If any of this regresses later, nothing will notice automatically.

## 1. The reference question, end to end (confirmed)

> **You:** ¿qué cajas no cierran el presupuesto óptico?
>
> **FiberDesk:** I'll check the optical budgets for all NAPs.
>
> Dos cajas no cumplen (contra un presupuesto GPON clase B+ de 28 dB y margen mínimo recomendado
> de 3,00 dB):
>
> **NAP-09 — Barrio Los Silos: FALLA**
> - Pérdida total 29.4 dB, margen **-1.4 dB** (potencia Rx -26.4 dBm).
> - Desglose: splitters 21 dB, fibra 5.2 dB, conectores 2.4 dB, empalmes 0.8 dB.
> - Causa: cascada de dos splitters 1:8 — uno heredado de NAP-04 (10.5 dB) y el propio de NAP-09
>   (10.5 dB), sobre 12 km (FR-04) + 8.8 km (FR-09).
>
> **NAP-12 — Barrio Güiraldes: MARGINAL**
> - Pérdida total 25.23 dB, margen **2.77 dB** (potencia Rx -22.23 dBm), por debajo del mínimo de
>   3,00 dB.
> - Desglose: splitters 17 dB, fibra 4.95 dB, conectores 2.4 dB, empalmes 0.88 dB.
> - Causa: splitter 1:2 heredado de NAP-03 (3.5 dB) más el 1:16 propio (13.5 dB), sobre 11.2 km
>   (FR-03) + 8.6 km (FR-12).
>
> Las otras diez cajas pasan, la más ajustada es NAP-06 (Villa Prosperidad) con margen 3.44 dB.

What this shows:

- **Survey before zoom.** The opening line announces a check over *all* NAPs, and the answer then
  details exactly the two that need it — the ordering Phase 1 was built around. The mention of
  NAP-06 at 3.44 dB could only come from the survey's twelve rows.
- **Every figure is the engine's.** 29.4 / -1.4 for NAP-09, 25.23 / 2.77 for NAP-12 and 3.44 for
  NAP-06 match `seed/expected-budgets.json` exactly, to the digit. Nothing was re-derived in prose.
- **The cascade is attributed hop by hop**, naming the inherited stage and the run it arrives on —
  the reason `detail_optical_budget` exists as its own tool.
- **A question in Spanish, an answer in Spanish**, over a dataset and tools that are entirely in
  English.

## 2. A value the project does not model (confirmed)

> **You:** sensibilidad del receptor de la ONT
>
> **FiberDesk:** La sensibilidad del receptor de la ONT no está disponible en el sistema: es un
> valor que este proyecto deliberadamente no modela.
>
> Los presupuestos ópticos aquí se calculan contra el presupuesto de la clase GPON, no contra la
> sensibilidad de un ONT concreto. Por ejemplo, NAP-09 y NAP-12 se evalúan contra un presupuesto
> clase B+ de 28 dB, con un margen mínimo recomendado de 3,00 dB.
>
> Sí dispongo de la potencia de recepción calculada por enlace (por ejemplo, -26.4 dBm en NAP-09 y
> -22.23 dBm en NAP-12), pero no hay ningún umbral de sensibilidad de ONT en el sistema con el cual
> compararla. Si quieres, puedo buscar en la documentación técnica si menciona el tema.

The deliberate gap in the corpus still holds under the map page: the assistant says it does not
have the figure, explains what it does have instead, and offers to search rather than inventing a
number. It also keeps the distinction the project cares about — class budget, not device
sensitivity.

## 3. The map (confirmed)

On the first question the map highlighted both NAPs and reframed the view onto them — the last
step of the reference use case, driven by a payload the route handler projected from the tool
results rather than by anything the model wrote.

Pressing Enter in the chat input submits the question, as it did before the map existed.

Whether an answer that highlights nothing leaves the previous highlight alone was checked with a
replayed turn instead (tasks.md 6.2), since it needs a turn that calls no tool and costs an API
call to reproduce live.
