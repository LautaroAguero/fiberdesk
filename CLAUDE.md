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
2. **Censo primero, zoom después.** El modelo llama `calculate_all_budgets()` —sin argumentos— y
   recibe 12 filas flacas: id, atenuación total, margen y estado. Con eso ya sabe *cuáles* fallan,
   sin conocer ningún ID de antemano.
3. Recién ahí invoca `calculate_optical_budget` sobre **las dos** que le interesan, NAP-09 y
   NAP-12, para pedir el desglose completo. Si las pide en el mismo turno salen en paralelo, que
   es el comportamiento por defecto y no cuesta un token extra.

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
| **2** | RAG sobre documentación técnica, con citas | FastAPI · PostgreSQL + pgvector |
| **3** | **Copiloto sobre el mapa** — el diferenciador | MapLibre GL |
| **4** | Producción: deploy, evals, observabilidad de costo *(opcional)* | AWS · Docker |

---

## Stack

**Base:** Next.js (App Router) · TypeScript · Tailwind CSS
**IA:** Anthropic SDK (`@anthropic-ai/sdk`)
**Fase 2:** Python/FastAPI · PostgreSQL + pgvector
**Fase 3:** MapLibre GL
**Fase 4:** Docker · AWS

---

## Estado actual

**Fase 0 cerrada.** Scaffold de Next.js verificado, `seed/network.json` con sus casos límite,
carga y validación estructural del dataset, y el flujo de OpenSpec andando de punta a punta.

**Fase 1 a mitad de camino.** El motor de presupuesto óptico está hecho: `src/lib/optical/`
calcula, clasifica y desglosa por tramo, con las constantes centralizadas y los tests atados a
`seed/expected-budgets.json`. Es TypeScript puro — no interviene ningún modelo.

Dos capacidades viven en `openspec/specs/`: `network-dataset` y `optical-budget`.

**Lo próximo — la otra mitad de la Fase 1:** la capa conversacional. Route handler con streaming,
las dos herramientas del caso de uso de referencia (`calculate_all_budgets` y
`calculate_optical_budget`) expuestas al modelo con `strict: true`, y el `highlight` proyectado
por el código. Arranca, como todo, con una propuesta de OpenSpec.

---

## Convenciones

- Un cambio no trivial = una propuesta de OpenSpec antes del código.
- Los artefactos de OpenSpec y el README, en inglés.
- Las constantes ópticas, centralizadas y comentadas con unidad y fuente.
- Los cálculos deterministas van con tests unitarios: son la parte del sistema que **debe**
  dar siempre el mismo resultado.
