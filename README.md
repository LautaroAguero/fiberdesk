# FiberDesk

An AI copilot over an FTTH network: an interactive map plus technical documentation.

You see the fiber infrastructure drawn on a map — the OLT, the splitter enclosures (NAPs), the
fiber runs, the subscribers — and ask questions in plain language. The assistant answers *and*
highlights the answer on the map. It also computes the optical power budget of any link, and
answers from loaded technical documentation while citing its source.

**The rule that shapes every design decision:** the model reasons and orchestrates, the code
calculates. The LLM decides *what* to compute and over *which* entities, then explains the result.
The arithmetic is done by deterministic TypeScript that always returns the same answer. A numeric
answer produced by the model instead of a tool is a bug, not a shortcut.

## Status

**Phase 0 — foundations.** The scaffold, the spec workflow and the network dataset are in place.
The optical budget engine, the assistant and the map belong to later phases.

## Getting started

```bash
npm install
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

```bash
npm test          # run the suite once
npm run test:watch
```

## The network dataset

`seed/network.json` holds the network the whole product reasons about: one OLT in Resistencia
(Chaco, Argentina), 12 NAPs across the city, the fiber runs connecting them, and the subscribers
they serve.

**Everything in it is invented.** The coordinates are real places and the physics is real, but no
element comes from a real operator, a real customer or a production system, and none ever will.

### The edge cases are deliberate

A network where every link passes cannot demonstrate anything — the product's core question is
*which links fail their optical budget*, and that question needs an answer. So the dataset is built
to contain failures:

| NAP | Total loss | Margin (B+ budget, 28 dB) | Why |
|---|---|---|---|
| **NAP-09** | 29.40 dB | **−1.40 dB** — fails | Two 1:8 splitters cascaded: 21 dB of splitter loss alone |
| **NAP-12** | 25.23 dB | **2.77 dB** — marginal | A 1:2 feeding a 1:16, plus 19.8 km of fiber; below the 3 dB minimum |
| **NAP-06** | 24.56 dB | 3.44 dB — passes | No cascade, but a 1:32 at the end of a 20 km run: just above the threshold |

The remaining nine NAPs pass with comfortable margin. Splitter cascades are the most common reason
a real link ends up marginal, so two of the three cases are cascades.

### Expected outcomes are committed as an oracle

`seed/expected-budgets.json` records, per NAP, the accumulated inputs (kilometres, connectors,
splices, splitter chain) and the loss figures they produce. It was derived by hand **before** any
calculator existed, so the Phase 1 optical budget engine has something independent to be checked
against. If the two disagree, one of them is wrong, and the disagreement is the signal.

⚠️ The loss values behind those figures (0.25 dB/km, 0.40 dB per connector, 0.08 dB per splice, and
the splitter table) are industry-typical and **pending validation** against real specifications.
Do not treat them as established fact.

### Loading it

`src/lib/network/load.ts` reads and validates the seed on the server. Validation is all-or-nothing:
you get a network satisfying every structural rule — single root, no cascade cycles, every
reference resolving, supported splitter ratios, coordinates inside the modelled city — or an error
naming what broke. Nothing is silently dropped, defaulted or repaired.

## How changes are made here

Every non-trivial change starts as an OpenSpec proposal, before any code is written. `openspec/`
holds that process: `specs/` is what the system does today, `changes/` is what is being proposed.

```bash
npx openspec list   # active changes
npx openspec view   # interactive dashboard
```

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · Vitest. Later phases add the Anthropic SDK,
Python/FastAPI with PostgreSQL + pgvector, and MapLibre GL.
