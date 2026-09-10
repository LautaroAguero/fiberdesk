# Manual verification (task 7.1)

Four behaviours no unit test can cover — see design.md, Risks/Trade-offs. Verified once, live,
against the real API (`claude-opus-5`), driving the actual chat page through a browser rather than
calling the API directly. If any of these regress later, nothing will notice automatically.

## 1. A documentation question is answered with a citation (confirmed)

> **You:** How does cascaded splitter loss affect a link budget?
>
> **FiberDesk:** I'll look that up in the project documentation.
>
> From the documentation (splitters-and-cascades.md):
>
> A cascade is a splitter fed from the output of another splitter rather than directly from the
> OLT. Cascaded splitter loss is additive: the insertion loss of every splitter stage in the chain
> applies to every subscriber downstream of the last one, on top of the fiber, connector, and
> splice loss the whole path already carries. It is the single most common reason an otherwise
> reasonable-looking link ends up marginal or fails its budget outright. Two cascaded splitters of
> a modest ratio can easily contribute more insertion loss than either splitter's ratio alone would
> suggest, because the losses of both stages stack rather than averaging. A route review that only
> checks the final splitter's ratio, without walking the whole chain back to the OLT, will
> consistently under-estimate the total splitter insertion loss on a cascaded link. When a link is
> marginal, checking whether it descends from a splitter cascade — and how many stages deep — is
> usually the fastest way to understand where the loss actually came from.
>
> For context on why ratios matter, the same document notes that every splitter output pays for the
> power division in insertion loss, and each doubling of the ratio adds several decibels to every
> one of those subscribers' links.
>
> And from gpon-link-budget.md: a link designed right at its class limit has no room for
> degradation — connector wear, a re-splice after a repair, or a slightly longer replacement fiber
> run can all push a marginal link over the edge.
>
> If you'd like, I can run `detail_optical_budget` on a specific NAP — it attributes each loss to
> its fiber run and splitter, including splitters inherited from an upstream NAP in a cascade.
>
> *(UI activity log: "✓ search_documentation".)*

Confirms: the tool was called; the answer closely paraphrases the actual corpus text rather than
inventing an explanation; both source documents are named by file.

## 2. A question in Spanish retrieves from the English corpus (confirmed)

> **You:** ¿Por qué se cae la señal cuando llueve?
>
> **FiberDesk:** Busco en la documentación (el corpus está en inglés).
>
> Sí, la documentación cubre esto (troubleshooting-guide.md, sección "Environmental Factors"):
>
> La humedad es una de las causas más comunes de un enlace que se degrada de forma intermitente en
> lugar de fallar por completo. La entrada de agua en una caja mal sellada o en una cubierta de
> fibra dañada permite que el revestimiento (cladding) de la fibra absorba parte de la luz
> transmitida, lo que se manifiesta como una atenuación que empeora durante o después de la lluvia y
> se recupera parcialmente cuando la sección afectada se seca. Un conector o una caja de empalme que
> no esté completamente sellada es un punto de entrada habitual, y revisar juntas y sellos suele ser
> más productivo que volver a medir la fibra cuando una avería coincide con tiempo húmedo.
>
> El mismo documento añade que los cambios de temperatura pueden producir un patrón intermitente
> parecido al estresar mecánicamente un empalme o conector marginal, aunque el aumento de pérdida
> por ciclado térmico es normalmente menor y menos abrupto que el que provoca la entrada de humedad.
>
> Nota: los presupuestos ópticos de este sistema son cálculos de diseño y no incluyen ningún factor
> ambiental ni meteorológico. Si quieres, puedo revisar qué enlaces están marginales (con poco
> margen), ya que son los que primero caerían ante una degradación por humedad.
>
> *(UI activity log: "✓ search_documentation".)*

Confirms: the assistant states plainly that it is searching an English corpus; the query it
composed found the correct section (a section about moisture, matched from a Spanish question that
never used the words "moisture" or "water"); it answers in Spanish, faithfully translating the
retrieved English passage; it adds an honest scope note (weather is not a modelled factor) rather
than overstating what the system covers.

## 3. The fiber-attenuation disagreement is surfaced, not resolved silently (confirmed)

> **You:** What fiber attenuation value at 1490nm should I assume?
>
> **FiberDesk:** There are **two different figures**, and they disagree:
>
> - **Documentation (gpon-link-budget.md):** fiber attenuation at the downstream wavelength
>   (1490 nm) is commonly modeled at 0.22 dB per kilometer of route length for standard
>   single-mode fiber in outside-plant conditions.
> - **The system's constants:** 0.25 dB/km at 1490 nm, downstream, marked as industry-typical and
>   pending validation.
>
> These do not agree. The value this system actually computes every optical budget with is
> **0.25 dB/km** (from the constants), not the 0.22 dB/km in the document. If you are hand-checking
> a budget against tool output, use 0.25 dB/km; the 0.22 dB/km discrepancy is worth resolving with
> whoever owns the configuration.
>
> One related point from the same document: route length, not straight-line distance, is what this
> figure should be applied to — fiber follows ducts and poles, not a direct line between two points.
>
> *(UI activity log: "✓ search_documentation", "✓ get_optical_constants" — both tools called.)*

Confirms: both figures are reported, each attributed to its actual source; the assistant states
plainly that they disagree; it does not silently pick one — it explains which value the system
computes with while leaving the documented figure on the record as what the document says.

## 4. ONT receiver sensitivity is still declined, from neither source (confirmed)

> **You:** What is the ONT receiver sensitivity?
>
> **FiberDesk:** ONT receiver sensitivity is **not available in this system** — it is not one of
> the modeled optical constants, and no budget tool reports it. The constants cover only fiber
> attenuation, connector loss, splice loss, splitter insertion loss per ratio, the GPON class
> budgets (B+ 28 dB, C+ 32 dB) and the recommended minimum margin (3 dB).
>
> Instead of comparing received power against a receiver sensitivity, budgets here are computed as
> total accumulated loss against the GPON class budget, with margin measured from that limit. The
> documentation describes sensitivity conceptually — the link only works if what remains at the far
> end still clears the receiver's minimum sensitivity — but it does not state a value, and neither
> does the dataset.
>
> If you need a specific sensitivity figure, it would have to come from your ONT vendor's
> datasheet, which I don't have.

Confirms: the gap holds from both sources — the assistant correctly distinguishes between the
concept being *mentioned* in the documentation (gpon-link-budget.md's overview paragraph) and a
*figure* being stated, and states that no figure exists in either place rather than inventing one
or mistaking a conceptual mention for a value.

## Result

All four behaviours confirmed against the live API, through the actual chat page. Task 7.1 is
complete.
