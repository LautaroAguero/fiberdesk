# FiberDesk — contexto del proyecto

> Este archivo se carga automáticamente en cada sesión de Claude Code sobre este repositorio.
> Es la fuente de verdad del **qué**, el **por qué** y las **reglas que no se negocian**.

---

## Qué es FiberDesk

Un **copiloto de IA sobre una red FTTH**: mapa interactivo + documentación técnica.

El usuario ve la infraestructura de fibra dibujada sobre un mapa —OLT, cajas de distribución
(NAPs), tendidos, clientes— y pregunta en lenguaje natural. El asistente responde **y resalta
la respuesta sobre el mapa**. Además calcula el **presupuesto óptico** de cualquier enlace y
responde sobre documentación técnica cargada, **citando la fuente**.

**No es** un producto comercial, ni una plataforma multi-cliente, ni entrena modelos.

---

## 🔑 La regla que ordena todo el diseño

> **El modelo razona y orquesta. El código calcula.**

El LLM decide *qué* computar y sobre *qué* entidades, y después **explica** el resultado en
lenguaje humano. La aritmética la hace **código determinista de TypeScript** que siempre
devuelve lo mismo.

Si en algún momento una respuesta numérica sale del modelo en vez de una herramienta, **es un
bug**, no una optimización.

---

## 🚫 Reglas duras

### 1. Todos los datos de red son sintéticos
La red vive en `seed/network.json` y es **completamente inventada**. Coordenadas reales de
Resistencia (Chaco, Argentina), física real, **datos ficticios**.
**Nunca** incorporar datos de un ISP real, de un cliente o de un sistema en producción.

### 2. Los valores de física se parametrizan, no se hardcodean
Todas las constantes ópticas viven en un archivo de configuración, nunca esparcidas por el
código. Cada una lleva comentario con su unidad y su fuente.
⚠️ Los valores actuales son **típicos de industria y están pendientes de validación** contra
especificaciones reales. No tratarlos como verdad establecida.

### 3. El asistente dice "no sé"
Si la documentación cargada no contiene la respuesta, el sistema **lo dice explícitamente**.
Jamás inventa una configuración, un valor de equipo ni una especificación.
Un asistente técnico de redes que alucina es peor que no tener asistente.

### 4. Spec antes que código
Todo cambio no trivial arranca con una propuesta de OpenSpec (`/opsx:propose`). El código se
escribe **después** de que la spec está acordada. Este flujo es parte del valor del proyecto,
no burocracia.

### 5. Idioma
- **Código, comentarios, README y artefactos de OpenSpec: en inglés.** El repositorio es
  público y su audiencia es internacional.
- **Conversación con el usuario: en español.**

---

## Dominio: lo mínimo que hay que entender

**GPON / FTTH.** La luz sale de un **OLT** (la cabecera del proveedor), viaja por fibra, se
reparte en **splitters** (divisores, alojados en cajas o NAPs) y llega a la **ONT** de cada
cliente. Cada elemento del camino **atenúa** la señal.

**Presupuesto óptico.** Es cuánta pérdida tolera el enlace antes de dejar de funcionar. Se
suman todas las pérdidas y se compara contra el presupuesto de la clase GPON:

| Fuente de pérdida | Valor típico ⚠️ *(a validar)* |
|---|---|
| Fibra a 1490 nm | 0,25 dB/km |
| Splitter 1:2 / 1:4 / 1:8 / 1:16 / 1:32 | 3,5 / 7,2 / 10,5 / 13,5 / 17,0 dB |
| Conector | 0,4 dB |
| Empalme por fusión | 0,08 dB |
| **Presupuesto GPON clase B+ / C+** | **28 / 32 dB** |
| **Margen mínimo recomendado** | **3 dB** |

**Los splitters se encadenan.** Un NAP puede colgar de otro NAP, y las pérdidas se acumulan.
Es la causa más común de que un enlace quede al límite.

---

## El caso de uso de referencia

Todo el diseño se ordena alrededor de este recorrido. Hay que poder demostrarlo en 30 segundos.

**El usuario, con el mapa abierto, escribe:** *"¿qué cajas no cierran el presupuesto óptico?"*

1. El frontend manda al route handler: historial + pregunta + estado del mapa.
2. **Censo primero, zoom después.** El modelo llama `summarize_optical_budgets` —sin argumentos
   obligatorios— y recibe 12 filas flacas: id, nombre, atenuación total, margen y estado. Con eso
   ya sabe *cuáles* fallan, sin conocer ningún ID de antemano.
3. Recién ahí invoca `detail_optical_budget` sobre **las dos** que le interesan, NAP-09 y NAP-12,
   para pedir el desglose completo. Si las pide en el mismo turno salen en paralelo, que es el
   comportamiento por defecto y no cuesta un token extra.

   El código recorre el árbol desde cada caja hasta el OLT y suma pérdidas:

   ```
   NAP-12 — Caja Barrio Güiraldes
   ──────────────────────────────────────────
   Fibra:        19,8 km × 0,25 dB/km  =  4,95 dB
   Splitter 1:16                        = 13,50 dB
   Splitter 1:2 (cascada desde NAP-03)  =  3,50 dB
   Conectores:   6 × 0,40 dB            =  2,40 dB
   Empalmes:    11 × 0,08 dB            =  0,88 dB
   ──────────────────────────────────────────
   ATENUACIÓN TOTAL                       25,23 dB
   Presupuesto GPON clase B+              28,00 dB
   MARGEN DISPONIBLE                       2,77 dB   ⚠️ bajo el mínimo de 3 dB
   ```

4. El modelo explica en prosa **por qué** NAP-12 está al límite: la cascada de splitters aporta
   17 de los 25,23 dB, y 3,50 de esos los hereda de NAP-03.

5. **El `highlight` no sale del modelo.** El route handler ya ejecutó las herramientas y tiene
   los resultados en memoria, así que proyecta la salida estructurada él mismo:

   ```json
   { "highlight": [
       { "id": "NAP-12", "status": "warning", "margin_db": 2.77 },
       { "id": "NAP-09", "status": "fail",    "margin_db": -1.40 }
     ],
     "fit_bounds": true }
   ```

6. El mapa pinta las cajas problemáticas, encuadra la vista y muestra el desglose al hacer clic.

> **Por qué este recorrido y no otro.** Una versión anterior pedía las 12 llamadas en paralelo de
> entrada. Se cambió por dos razones. Primero, el costo: 12 desgloses completos son ~1.650 tokens
> contra ~630 del censo más el zoom, y sólo dos de esos desgloses se terminan citando. Segundo, y
> más de fondo: para disparar 12 llamadas el modelo necesita **conocer los 12 IDs antes de
> empezar**, lo que obliga a inyectarlos en el prompt o a gastar un viaje extra en listarlos. El
> censo se los descubre.
>
> Lo mismo con el `highlight`: cada campo de ese JSON ya existe en un `tool_result` que produjo
> código determinista. Pedírselo al modelo sería pedirle que **copie números**, y copiar es
> exactamente donde un LLM escribe 2,7 en vez de 2,77. La regla que ordena el proyecto aplica
> también a la salida estructurada, no sólo al cálculo.

---

## El set de datos

`seed/network.json` — un OLT en Resistencia, ~12 NAPs repartidos por la ciudad, tendidos de
fibra y clientes.

**Criterio de diseño:** el dataset **debe incluir casos límite a propósito** — una caja que no
cierra, otra que cierra sin margen suficiente, y al menos una cascada de splitters. Una red
donde todo funciona no permite demostrar nada.

```json
{
  "olt": { "id": "OLT-RES-01", "lat": -27.4512, "lon": -58.9866,
           "tx_power_dbm": 3.0, "gpon_class": "B+" },
  "splitters": [
    { "id": "NAP-07", "lat": -27.4390, "lon": -58.9721,
      "ratio": "1:8", "parent": "OLT-RES-01" }
  ],
  "fiber_runs": [
    { "id": "FR-07", "from": "OLT-RES-01", "to": "NAP-07",
      "length_km": 12.4, "splices": 6, "connectors": 4,
      "geometry": [[-58.9866,-27.4512], [-58.9721,-27.4390]] }
  ]
}
```

---

## Fases

Cada fase es **independiente y entregable por sí sola**. No se arranca la siguiente sin cerrar
y desplegar la anterior.

| Fase | Qué | Stack que suma |
|---|---|---|
| **0** | Cimientos: repo, OpenSpec, set de datos | — |
| **1** | Núcleo conversacional: streaming, tool use, structured outputs | Anthropic SDK |
| **2** | RAG sobre documentación técnica, con citas | — *(nada: ver abajo)* |
| **3** | **Copiloto sobre el mapa** — el diferenciador | MapLibre GL |
| **4** | Producción: deploy, evals, observabilidad de costo *(opcional)* | AWS · Docker |

> **La Fase 2 no suma infraestructura, y eso fue un cambio de plan.** El plan original decía
> FastAPI + PostgreSQL + pgvector. Se cayó al verificar tres cosas contra el SDK instalado:
>
> 1. **Anthropic no tiene endpoint de embeddings.** El cliente expone `messages`, `models`,
>    `files`, `skills` y `beta`, nada más. pgvector obligaría a sumar un **segundo proveedor de
>    IA** al proyecto, con su clave y su factura, por un corpus de cinco documentos.
> 2. **Las citas son nativas de la API.** `citations: { enabled: true }` sobre un bloque
>    devuelve el texto citado y su ubicación exacta. La mitad de "con citas" no hay que
>    construirla.
> 3. **Existe el bloque `search_result`** —con `source`, `title`, `content[]` y `citations`— y
>    el tipo de `tool_result` lo acepta. Una tool propia devuelve resultados de búsqueda y el
>    modelo los cita nativamente. Está hecho a medida para esto.
>
> Con un corpus chico, la recuperación se resuelve con **BM25 en TypeScript**: determinista, sin
> proveedor externo, y —lo que más pesa— **testeable unitariamente**, igual que el motor óptico.
> Es la misma jugada que proyectar el `highlight` en código: correr trabajo de territorio-eval a
> territorio-test.
>
> Si algún día el corpus creciera a cientos de documentos, o las consultas fueran muy
> parafraseadas, ahí sí los embeddings se ganan el lugar. Hoy no.

---

## Stack

**Base:** Next.js (App Router) · TypeScript · Tailwind CSS
**IA:** Anthropic SDK (`@anthropic-ai/sdk`)
**Fase 2:** nada nuevo — BM25 propio sobre un corpus en disco
**Fase 3:** MapLibre GL
**Fase 4:** Docker · AWS

---

## Estado actual

**Fase 0 cerrada.** Scaffold de Next.js verificado, `seed/network.json` con sus casos límite,
carga y validación estructural del dataset, y el flujo de OpenSpec andando de punta a punta.

**Fase 1 cerrada.** Las dos mitades están hechas:

- **El motor óptico** (`src/lib/optical/`) calcula, clasifica y desglosa por tramo, con las
  constantes centralizadas y los tests atados a `seed/expected-budgets.json`. TypeScript puro —
  no interviene ningún modelo.
- **La capa conversacional** (`src/lib/assistant/` y `src/app/api/chat/route.ts`): route handler
  con streaming SSE, loop de tool use escrito a mano, las dos herramientas con `strict: true` y
  el `nap_id` como enum derivado del dataset, y el `highlight` proyectado por el código. La
  página de chat de entonces era deliberadamente fea: existía para que la fase se pudiera
  demostrar sola, no para lucirse. La Fase 3 la reemplaza por el mapa.

**Fase 2 cerrada.** Búsqueda sobre documentación técnica con citas, sin sumar infraestructura:

- **El corpus** (`corpus/`): cuatro documentos Markdown sintéticos, en inglés, con cargador y
  validador estructural en `src/lib/corpus/` que falla fuerte y nombra qué se rompió, igual que
  el de la red.
- **La recuperación**: BM25 en TypeScript, indexado en memoria al arrancar. Mismo corpus y misma
  consulta dan siempre el mismo ranking, así que se testea como el motor óptico.
- **Dos herramientas nuevas**, que suman cuatro: `search_documentation` devuelve bloques
  `search_result` con citas nativas, y `get_optical_constants` expone las constantes con su
  unidad y su estado de "pendiente de validación", para comparar lo que dice un documento contra
  lo que el sistema usa para calcular.
- **Dos fallas a propósito en el corpus**, como los casos límite del dataset: un **hueco** (la
  sensibilidad del receptor de la ONT no está documentada) y una **contradicción** (un documento
  da una atenuación de fibra distinta a la de `src/lib/optical/constants.ts`).

**Fase 3 cerrada.** El mapa copiloto que reemplaza la página de chat plana:

- **El mapa** (`src/components/NetworkMap.tsx`, MapLibre GL sobre tiles de OpenFreeMap, sin clave
  ni cuenta) dibuja toda la red al abrir la página — OLT, 12 NAPs, 12 tendidos, 28 clientes — y
  cae a un fondo liso si el estilo base no carga.
- **Tres helpers puros, con tests** (`src/lib/map/`): `networkToGeoJson` convierte la red en las
  capas del mapa; `resolveHighlight` traduce el `HighlightPayload` de un turno en qué NAP
  colorear, qué tendidos marcar y a dónde encuadrar —sin recorrer el árbol de nuevo: usa los
  `hops` que ya trae cada `BudgetResult`—; y `formatBreakdown` da formato al desglose por NAP sin
  tocar ningún número.
- **`src/app/page.tsx` es ahora un server component**: carga la red y calcula los doce
  presupuestos una sola vez, server-side, y se los pasa a `Copilot` (client), que compone el mapa
  con `ChatPanel` — el chat de la Fase 1, sacado de la página sin cambiar su lógica. Ningún
  número en pantalla sale del modelo ni se recalcula en el navegador.
- **El worker de MapLibre se copia a `public/maplibre/`** antes de `dev` y `build`
  (`scripts/copy-maplibre-worker.mjs`). MapLibre 6 lo busca relativo a su propio bundle y
  Turbopack no lo emite: sin la copia, el mapa nunca termina de cargar.

Los checks visuales se verificaron en el navegador reproduciendo turnos grabados, sin llamar a la
API (grupo 6 de `tasks.md`), y la corrida real se hizo una vez a mano, como en las Fases 1 y 2.

**326 tests, y ninguno llama a la API.** Todo corre contra fixtures grabados, el seed y el corpus
reales. Las conductas que ningún test puede cubrir se verificaron a mano una vez contra la API
real, para las fases ya cerradas:

- Fase 1 (`openspec/changes/archive/2026-09-09-add-conversational-layer/verification.md`): que
  haga censo antes que zoom, y que diga "no lo tengo" en vez de inventar.
- Fase 2 (`openspec/changes/archive/2026-09-10-add-documentation-search/verification.md`): que
  responda citando la fuente, que una pregunta en español recupere del corpus en inglés, que
  señale la contradicción de atenuación en vez de elegir un valor en silencio, y que siga
  declinando la sensibilidad de la ONT.
- Fase 3 (`openspec/changes/archive/2026-09-22-add-map-copilot/verification.md`): que el mapa marque las cajas de la
  respuesta y reencuadre, y que siga declinando la sensibilidad de la ONT con el mapa delante.

**Evals (Fase 4, primer ítem: `add-eval-harness`).** Esas conductas ya no dependen sólo de la
verificación a mano: `npm run eval` le hace 21 casos al modelo real y los califica con graders
deterministas, bajo un tope de gasto obligatorio. Cada corrida queda en `evals/runs/` y se puede
**re-calificar offline** (`npm run eval:regrade`), sin clave ni llamadas. El costo y la latencia de
cada llamada se miden en código (`src/lib/assistant/pricing.ts`, `usage.ts`).

**Baseline** (`claude-opus-5`, effort `low`, una corrida, $1,03): **15/21 (71,4%, IC 95% 50,0–86,2%)**;
costo por pregunta mediana $0,0376, p95 $0,0663; latencia p95 13,1 s. Lo que falla: el modelo hace
cuentas en la prosa (19,8 km, 0,23 dB) y a veces se queda en el censo sin pedir el desglose. El
grader de grounding se validó a mano sobre las 21 respuestas (`evals/grader-validation.md`).
⚠️ Es **una sola corrida**: el ruido entre dos corridas iguales se mide al arrancar
`reduce-cost-per-question`.

Correr la app requiere `ANTHROPIC_API_KEY` — ver `.env.example`. El mapa y la red se ven sin ella;
sólo el chat lo necesita.

**No hay base de datos.** La red se lee de `seed/network.json` y la documentación de `corpus/`,
las dos desde disco. Ver la nota bajo la tabla de fases para por qué se descartó pgvector.

Cinco capacidades viven en `openspec/specs/`: `network-dataset`, `optical-budget`,
`network-assistant`, `documentation-search` y `network-map`.

**Lo próximo:** `reduce-cost-per-question` (bajar a la mitad el costo por pregunta, medido contra
este baseline) y después las tres capacidades del handoff `docs/handoff/2026-10-07-map-user-capabilities.md`,
cada una con sus propios casos de eval.

Los nombres importan más de lo que parece: el modelo elige qué herramienta llamar leyendo el
nombre y la descripción, y nada más. `summarize_` y `detail_` nombran **la forma de la
respuesta**, que es justo el criterio de elección. Dos nombres parecidos serían pedirle que se
confunda.

---

## Convenciones

- Un cambio no trivial = una propuesta de OpenSpec antes del código.
- Los artefactos de OpenSpec y el README, en inglés.
- Las constantes ópticas, centralizadas y comentadas con unidad y fuente.
- Los cálculos deterministas van con tests unitarios: son la parte del sistema que **debe**
  dar siempre el mismo resultado.
