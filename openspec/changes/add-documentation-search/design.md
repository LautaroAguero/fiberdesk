# Design — documentation search

## Context

Phase 1 left a working assistant with two tools, a hand-written tool-use loop, an SSE stream and a
server-projected map payload. Nothing about that machinery needs to change: this phase adds tools
to a surface that already accepts them.

See `proposal.md` — *Why* for the three findings that removed pgvector from the plan, and
`specs/documentation-search/spec.md` plus `specs/network-assistant/spec.md` for the contract.

One fact from Phase 1 shapes a decision here: the highlight is projected in code rather than
requested as structured output. Citations are **incompatible with `output_config.format`** — had
Phase 1 gone the other way, this phase would have collided with it head-on. That is luck as much
as foresight, and worth recording.

## Goals / Non-Goals

**Goals:**

- An answer drawn from documentation carries the passage it came from, quoted rather than
  paraphrased.
- Retrieval is deterministic, so it can be tested rather than merely observed.
- The corpus is a folder of Markdown someone can read, diff, and replace with their own.
- Documentation costs nothing on turns that do not need it.

**Non-Goals (design level):**

- Retrieval quality beyond a documented BM25 baseline. With five documents there is nothing to
  tune against that is not noise.
- Any ingestion pipeline. No PDF parsing, no OCR, no chunk-size experiments.
- Drawing anything. Phase 3.

## Decisions

### 1. BM25, chosen for determinism before relevance

Embeddings are out because Anthropic has no embeddings endpoint and a five-document corpus does
not justify a second AI provider. That leaves lexical ranking, and BM25 is its standard form.

The deciding property is not that BM25 ranks well. It is that it ranks *identically every time*:

```
  deterministic, unit-testable        model behaviour, needs an eval
  ----------------------------        ------------------------------
  corpus loading + validation         did it search when it should have?
  BM25 ranking          <-- here      did it cite what it quoted?
  search_result assembly              did it surface the disagreement?
  constants reporting
```

This is the same move as projecting the highlight in code in Phase 1: pull work leftward, into the
column that a test can hold. A vector search against a hosted embedding model would sit in the
right-hand column, needing a network call and a provider's model version to stay put.

*Consequence accepted:* lexical search misses paraphrase. A question about "rain" will not match a
passage about "moisture absorption" on its own — which is exactly where embeddings earn their
keep, and exactly what decision 3 addresses instead.

### 2. Paragraphs are the citation unit, so paragraphs are the chunks

`SearchResultBlockParam.content` is an array of text blocks, and a citation points at a *range of
block indices*: the block is the smallest citable unit. So how a section is split is not an
implementation detail — it *is* the precision of every citation the assistant can make.

```
  seccion  ->  search_result
                 source   "gpon-link-budget.md"
                 title    "3.2 Cascaded splitters"
                 content  [ parrafo, parrafo, parrafo ]   <- granularidad de la cita
```

Splitting on paragraphs gives citations that point at a claim rather than at a page. Splitting on
sections would be cheaper and would make every citation useless for the thing citations are for.

Retrieval still ranks and returns whole *sections* — a paragraph torn from its section usually
reads as a fragment. The section is the unit of relevance; the paragraph is the unit of attribution.

### 3. The model writes the query, and that is the semantic layer

BM25 matches words. The user does not speak in the corpus's words, and may not speak its language.
Both gaps are closed at the same place: the model composes the query.

```
  usuario:  "por que se cae la senal cuando llueve?"
       |
  el modelo compone:  "moisture water absorption attenuation fiber"
       |
  BM25 encuentra la seccion correcta
```

This is the same mechanism that already decides which optical tool to call: intelligence at the
edge, determinism underneath. It costs nothing extra, and it means the retrieval layer never has to
be clever.

For it to work, the tool description must state that the corpus is in English. Without that the
model queries in the user's language, BM25 returns nothing, and the failure is silent — an empty
result is indistinguishable from a subject the corpus genuinely does not cover.

### 4. A fourth tool for the constants, rather than the system prompt

For the assistant to say "the document says 0.22, the system computes with 0.25", it must know the
second number. It currently has no way to: tools return computed results, not the inputs.

Putting the constants in the system prompt would be cheaper, and was rejected. The standing
requirement is that every figure comes from a tool result; a constant sitting in the prompt is a
figure the model can recite without calling anything, which softens the one rule the project is
built on.

The alternative the model might otherwise reach for is worse: NAP-12's breakdown shows 2.80 dB over
11.2 km, from which 0.25 dB/km is one division away. That division would be the model doing
arithmetic. The tool exists so that path is never necessary.

### 5. The gap is chosen, not arbitrary

The corpus deliberately omits ONT receiver sensitivity.

That subject was already the project's worked example of an honest "I don't have that" — it is
absent from the optical constants for a documented reason, and the Phase 1 manual verification
captured the assistant declining it. Writing documentation that covers it would break a verified
behaviour and remove the only end-to-end demonstration of the rule against inventing.

Keeping it absent makes the gap mean something sharper than before: not in the constants, and not
in the documentation either.

### 6. The corpus is a folder, and that is a feature

`corpus/*.md`, loaded and indexed at startup, validated the way the network seed is: fail loudly,
name the file, never load half of it.

The repository is public and the intent is that someone drops their own documents in. A folder of
Markdown is the lowest-friction thing to replace. It also bounds the failure mode honestly — a
corpus far larger than this design assumes will be slow and expensive rather than silently wrong,
and the limit belongs in the README rather than in a runtime guard nobody tuned.

### 7. Documentation costs nothing on turns that do not use it

The tool is called only when the question calls for it. A budget question pays no documentation
tokens at all.

The alternative — placing the whole corpus in the cached prefix — would be simpler and would make
every turn carry it, including the many that have nothing to do with documentation. Caching
softens that by roughly ten times; it does not make it free, and it fills the model's context with
material irrelevant to the question in front of it.

## Risks / Trade-offs

- **Lexical search will miss things a human would find** → mitigated by the model composing the
  query, not by the ranking. When it does miss, the assistant reports the corpus does not cover the
  subject — which is indistinguishable, from the outside, from a real gap. This is the sharpest
  limitation of the design and it is not fully mitigable without embeddings.
- **The corpus is synthetic, so citations point at invented documents** → the mechanism is real,
  the sources are not. Anyone reading a cited answer should understand they are seeing the
  machinery demonstrated, not a fact established. The README must say so plainly.
- **The contradiction behaviour cannot be tested** → whether the assistant surfaces the
  disagreement rather than quietly picking a side is model behaviour. Specified, verified once by
  hand, and unguarded thereafter — the same gap Phase 1 documented, now one item longer.
- **A fourth tool crowds the selection surface** → the model picks by name and description, and
  four choices are harder than two. The constants tool's description must make clear it returns
  configuration, not measurements, so it is not reached for when a budget question arrives.
- **Someone will drop a hundred PDFs into `corpus/`** → the loader reads Markdown only and will
  ignore or reject the rest, and the README states the scale this is built for. Beyond it, the
  honest answer is that a different retrieval design is needed.

## Migration Plan

Additive. Rollback is deleting `corpus/`, `src/lib/corpus/`, and the two tool definitions.

## Open Questions

- How many sections should a search return, and should there be a token ceiling on top of the
  count? Deferrable: the spec fixes that a documented maximum exists, and choosing the number is a
  one-line change that no other decision depends on. It wants a real corpus in front of it before
  being set.
