/**
 * The entity contract for the technical documentation corpus.
 *
 * A document is Markdown: one `#` title, followed by one or more `##`
 * sections, each holding one or more paragraphs. Both the BM25 index and the
 * citation mapping read this shape without transformation — see
 * design.md, decision 2, for why paragraphs (not sections) are the unit
 * citations point at.
 */

export interface CorpusSection {
  title: string;
  paragraphs: string[];
}

/** One document. `id` is the file's base name, e.g. `"gpon-link-budget.md"`. */
export interface CorpusDocument {
  id: string;
  title: string;
  sections: CorpusSection[];
}

export type Corpus = CorpusDocument[];
