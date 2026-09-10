# Tasks — documentation search

The design's Open Question (how many sections a search returns, and whether a token ceiling sits on
top of the count) is a one-line constant that gates no task below; pick a documented default in 3.2
and revisit it once a real corpus exists.

As in Phase 1, **no task may call the Anthropic API from the test suite**. Group 7's manual
verification is run by hand and is not automated.

## 1. The corpus

- [x] 1.1 Write 3 to 5 short Markdown documents under `corpus/`, in English, reading like GPON
      deployment and specification notes — link budget, splitters and cascades, fiber attenuation,
      installation practice. Each needs one `#` title and named `##` sections, and every section
      needs at least one paragraph; verify the file count and that shape by eye and by the loader
      once 2.1 lands.
- [x] 1.2 Plant the deliberate contradiction: one document states fiber attenuation at 1490 nm as
      **0.22 dB/km**; verify by grep that the figure appears in exactly one document and that
      `src/lib/optical/constants.ts` still reads 0.25.
- [x] 1.3 Confirm the deliberate gap: no document states an ONT receiver sensitivity figure; verify
      by grepping the corpus for sensitivity terms and finding no numeric claim.

## 2. Loading and validation

- [x] 2.1 Add `src/lib/corpus/types.ts` and a loader that parses each Markdown file into a document
      with a title, named sections, and paragraph-level content; include unit tests that the
      committed corpus yields 3-5 documents, each with a title and at least one section.
- [x] 2.2 Add structural validation — a title is present, no section is empty, identifiers are
      unique — failing with an error naming the offending file and field, and never returning a
      partially loaded corpus; include a unit test per rule.
- [x] 2.3 Add the unit test that a document's identifier is its file name and is stable across two
      loads.

## 3. Ranking

- [x] 3.1 Implement tokenisation and the index build over the loaded corpus; include unit tests for
      term frequency and document frequency on a small hand-built corpus.
- [x] 3.2 Implement BM25 scoring with its parameters given standard values and a comment naming
      them, returning the top sections up to a documented maximum; include unit tests that a
      section discussing cascaded splitter loss outranks one mentioning splitters in passing, and
      that no more than the maximum is returned.
- [x] 3.3 Add unit tests for determinism and for the empty case: the same query twice returns
      identical ordered results, and a query matching nothing returns an empty list without
      raising.

## 4. Citable results

- [x] 4.1 Map a ranked section to a search result carrying the source document, the section title,
      and the section's paragraphs as separate blocks with citation enabled; include unit tests that
      provenance is present and that a four-paragraph section yields four blocks — the property the
      citation granularity depends on.

## 5. The two tools

- [x] 5.1 Add the `search_documentation` tool definition with a strict schema and a description
      that states the corpus is in English, plus its adapter over the ranking layer; include unit
      tests for the schema shape and for a query returning citable results.
- [x] 5.2 Add the `get_optical_constants` tool definition and adapter, reporting each constant with
      its unit and its standing as industry-typical and pending validation; include unit tests that
      fiber attenuation reads 0.25 dB/km at 1490 nm, that a fusion splice reads 0.08 dB, and that
      the pending-validation marker is present on each.
- [x] 5.3 Wire both tools into the dispatcher and extend its error paths to cover them; include
      unit tests that an unknown argument shape yields an errored tool result rather than a crash.

## 6. The assistant's obligations

- [x] 6.1 Extend the system prompt so the assistant cites the document it draws on, says the
      documentation does not cover a subject rather than substituting general knowledge, and reports
      both figures plus the disagreement when a document conflicts with a constant; verify by
      reading it back against the three requirements added to `network-assistant`.

## 7. Close-out

- [x] 7.1 Verify by hand, once, against the live API and record the transcripts in the change:
      a documentation question answered with a citation; a question asked in Spanish retrieving from
      the English corpus; the fiber-attenuation disagreement reported with both figures and their
      sources; and ONT receiver sensitivity still declined rather than invented.
- [x] 7.2 Document the corpus in `README.md` (in English) — that it is synthetic so citations point
      at invented sources, that retrieval is BM25 with no vector database, the scale it is built
      for, and how to replace it with your own documents; verify by reading it back against the
      proposal's Why.
- [x] 7.3 Run `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build`, and verify all
      four pass clean.
