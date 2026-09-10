## Purpose

Holds the technical documentation the assistant can draw on, finds the passages that bear on a
question, and returns them in a form the model can quote exactly — so that an answer sourced from
documentation carries the document and the passage it came from, rather than the model's summary
of it.

## ADDED Requirements

### Requirement: A corpus of technical documentation

The system SHALL hold a corpus of technical documents as Markdown files. Each document SHALL
declare a title and SHALL be divided into named sections.

Documents SHALL be entirely synthetic, written for this project. No document SHALL be copied from
a real operator, a real vendor's manual, or a published standard.

The corpus SHALL be written in English, and the language SHALL be stated wherever the corpus is
described to the model, because lexical search cannot bridge a language gap on its own.

#### Scenario: The corpus loads

- **WHEN** the corpus is loaded
- **THEN** between 3 and 5 documents are returned
- **AND** each carries a title and at least one named section
- **AND** each section carries at least one paragraph

#### Scenario: A malformed document is refused

- **WHEN** a document in the corpus has no title, or a section with no content
- **THEN** loading fails with an error naming the file and what is missing
- **AND** no partially loaded corpus is returned

#### Scenario: Documents are identified by their file name

- **WHEN** a passage from `gpon-link-budget.md` is returned
- **THEN** its source is reported as `gpon-link-budget.md`
- **AND** that identifier is stable across loads

### Requirement: Deliberate gaps and contradictions

The corpus SHALL be built to contain, on purpose, a subject it does not cover and a figure that
disagrees with the project's optical constants. A corpus in which everything is present and
everything agrees cannot demonstrate either behaviour.

#### Scenario: ONT receiver sensitivity is absent

- **WHEN** the corpus is searched for ONT receiver sensitivity
- **THEN** no passage stating a sensitivity figure is returned
- **AND** this matches the project's own scope: the optical constants do not model it either

#### Scenario: One document disagrees with the constants

- **WHEN** the corpus is searched for fiber attenuation at 1490 nm
- **THEN** a passage is returned stating 0.22 dB/km
- **AND** the project's optical constants state 0.25 dB/km for the same quantity
- **AND** both figures remain as they are — neither source is silently corrected to match the
  other

### Requirement: Ranked retrieval over the corpus

The system SHALL rank sections against a query using BM25, and SHALL return the highest-ranking
sections up to a documented limit.

Ranking SHALL be deterministic: the same corpus and the same query SHALL produce the same ordered
results on every call. The scoring SHALL run in code, never in the model.

#### Scenario: A query returns its most relevant sections first

- **WHEN** the corpus is searched for `splitter insertion loss cascade`
- **THEN** the section that discusses cascaded splitter loss ranks above a section that mentions
  splitters only in passing
- **AND** no more than the documented maximum number of sections is returned

#### Scenario: Repeated searches agree

- **WHEN** the same query is run twice against the same corpus
- **THEN** the two result lists are identical in content and in order

#### Scenario: A query that matches nothing returns nothing

- **WHEN** the corpus is searched for a term no document contains
- **THEN** an empty result list is returned
- **AND** no error is raised — finding nothing is an answer, not a failure

### Requirement: Results are returned in a citable form

Each retrieved section SHALL be returned as a search result carrying the document it came from,
the section's title, and the section's paragraphs as separate blocks, with citation enabled.

Paragraphs SHALL be separate blocks because the block is the smallest unit a citation can point
at: how the section is divided determines how precisely an answer can be attributed.

#### Scenario: A result carries its provenance

- **WHEN** a section is returned as a search result
- **THEN** it carries the source document's identifier and the section's title
- **AND** its content is the section's paragraphs, one block each

#### Scenario: Citation granularity follows the blocks

- **WHEN** an answer cites a section of four paragraphs
- **THEN** the citation identifies which of those paragraphs it drew on
- **AND** not merely the section as a whole
