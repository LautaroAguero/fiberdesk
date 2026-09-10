# Documentation search

**Phase 2.** The assistant gains a body of technical documentation it can search and cite.
Independently deployable: it adds no infrastructure and changes nothing about how the network is
loaded or how budgets are computed.

## Why

FiberDesk promises answers from technical documentation, with the source cited. There is no
documentation, and the assistant declines every question that would need it — correctly, but the
promise is unmet.

The plan for this phase used to be FastAPI, PostgreSQL and pgvector. That plan does not survive
contact with three facts, each verified against the installed SDK rather than recalled:

- **Anthropic has no embeddings endpoint.** A vector database would mean adding a second AI
  provider — its own key, its own bill, its own failure mode — to serve five documents.
- **Citations are native.** `citations: { enabled: true }` returns the cited text and its exact
  location. Half of "with citations" does not need building.
- **The `search_result` block exists**, carrying `source`, `title`, `content[]` and `citations`,
  and `tool_result` accepts it. A tool of our own returns search results and the model cites them
  natively.

So this phase adds no infrastructure at all.

## What Changes

- Add a small synthetic documentation corpus under `corpus/` — Markdown, written in English,
  three to five short documents that read like GPON deployment and specification notes.
- Add a loader and structural validator for it, in the shape the network loader already
  established: fail loudly and name what broke, never partially load.
- Add BM25 ranking over the corpus, in TypeScript. The corpus is indexed in memory at startup;
  nothing is persisted.
- Add `search_documentation`, a fourth tool returning matched sections as `search_result` blocks
  with citations enabled, so the model cites passages natively rather than paraphrasing them.
- Add `get_optical_constants`, exposing the project's optical constants — with their units and
  their standing as pending validation — so the assistant can compare what a document claims
  against what the system computes with.
- Build the corpus with two deliberate flaws, in the same spirit as the dataset's edge cases:
  - **A gap.** ONT receiver sensitivity stays absent, because the project does not model it
    either. The assistant's existing "not available" answer keeps holding, and now means it in
    two senses at once.
  - **A contradiction.** One document states a fiber attenuation figure that disagrees with
    `src/lib/optical/constants.ts`. The assistant must surface both and name the disagreement,
    rather than silently picking one.

**BM25 scoring is arithmetic, and it runs in deterministic TypeScript — never in the model.** Same
corpus and same query produce the same ranking every time, which is what makes retrieval
unit-testable rather than something only an eval could check.

## Non-goals

- **No vector database, no embeddings, no second AI provider.** Reconsider only if the corpus
  grows to hundreds of documents or queries turn out to be heavily paraphrased.
- **No second service and no second language.** No FastAPI, no Python. The search runs in the
  same route handler as the existing tools.
- **No PDF or Office ingestion.** Markdown only. A corpus you can read in a diff is worth more
  here than one you have to parse.
- **No persistence.** The index is built in memory at startup and dies with the process.
- **No relevance tuning beyond a documented baseline.** BM25's parameters get their standard
  values and a comment; tuning them against a five-document corpus would be fitting noise.
- **No evals.** As in Phase 1, the behaviours only a graded run could check are specified and
  verified by hand, and the gap is recorded rather than hidden.
- **No changes to `network-dataset` or `optical-budget`.** Both are read, not altered — the
  constants tool exposes what `optical-budget` already defines.
- **No map.** Phase 3.

## Capabilities

### New Capabilities

- `documentation-search`: holding a corpus of technical documentation, retrieving the passages
  that bear on a question, and returning them in a form the model can cite exactly.

### Modified Capabilities

- `network-assistant`: gains two tools — documentation search and the optical constants — and
  gains the obligation to cite documentation it draws on and to surface a disagreement between a
  document and the system's own constants.

## Impact

- **New files**: `corpus/` and its documents; `src/lib/corpus/` for loading, validating and
  ranking, with tests; two more tool definitions and adapters under `src/lib/assistant/`.
- **Existing code**: the tool list and the system prompt grow. The loop, the stream, the
  dispatcher and the highlight projection are untouched.
- **Token cost per turn rises** when documentation is consulted: a search result carries real
  prose, not a row of numbers. Cited text is exempt from token accounting on replay, which
  softens this across a conversation but not within one turn.
- **Downstream**: Phase 3's map is unaffected — documentation questions produce no highlight.
