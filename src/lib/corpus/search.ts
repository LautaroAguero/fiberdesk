/**
 * BM25 ranking over the corpus.
 *
 * Runs entirely in TypeScript, over an index built once at startup. Same
 * corpus and same query always produce the same ordered results — see
 * design.md, decision 1: that determinism is the reason this exists instead
 * of a hosted embedding search, not an incidental property of it.
 *
 * Ranking operates on *sections*, not whole documents: a document is often a
 * mix of subjects, and the section is small enough to be a meaningful unit
 * of relevance. See design.md, decision 2.
 */

import type { Corpus, CorpusSection } from "@/lib/corpus/types";

/** Standard BM25 term-frequency saturation constant. */
const K1 = 1.5;
/** Standard BM25 document-length normalisation constant. */
const B = 0.75;

/**
 * Maximum sections one search returns. Documented rather than tuned: with a
 * handful of short documents there is no real corpus to tune against yet.
 * See design.md, Open Questions.
 */
export const DEFAULT_RESULT_LIMIT = 5;

export interface RankedSection {
  documentId: string;
  documentTitle: string;
  section: CorpusSection;
  score: number;
}

export interface SearchIndex {
  search(query: string, limit?: number): RankedSection[];
}

/** Lowercases and splits on runs of non-alphanumeric characters. No stemming, no stopword removal. */
function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

interface IndexedSection {
  documentId: string;
  documentTitle: string;
  section: CorpusSection;
  termFrequencies: Map<string, number>;
  length: number;
}

/** Builds an in-memory BM25 index over every section in `corpus`. */
export function buildSearchIndex(corpus: Corpus): SearchIndex {
  const indexed: IndexedSection[] = [];

  for (const doc of corpus) {
    for (const section of doc.sections) {
      // The title is tokenized in with the paragraphs, so a query matching
      // only the section's title (e.g. "cascades") still finds it.
      const tokens = tokenize([section.title, ...section.paragraphs].join(" "));
      const termFrequencies = new Map<string, number>();
      for (const term of tokens) {
        termFrequencies.set(term, (termFrequencies.get(term) ?? 0) + 1);
      }
      indexed.push({
        documentId: doc.id,
        documentTitle: doc.title,
        section,
        termFrequencies,
        length: tokens.length,
      });
    }
  }

  const sectionCount = indexed.length;
  const averageLength =
    sectionCount === 0 ? 0 : indexed.reduce((sum, s) => sum + s.length, 0) / sectionCount;

  const documentFrequency = new Map<string, number>();
  for (const s of indexed) {
    for (const term of s.termFrequencies.keys()) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  /**
   * Robertson-Sparck Jones IDF, offset by +1 inside the log. In a small
   * corpus a term appearing in most sections can otherwise push classic IDF
   * negative; the +1 variant keeps every term's contribution non-negative.
   */
  function idf(term: string): number {
    const n = documentFrequency.get(term) ?? 0;
    return Math.log((sectionCount - n + 0.5) / (n + 0.5) + 1);
  }

  return {
    search(query: string, limit: number = DEFAULT_RESULT_LIMIT): RankedSection[] {
      const queryTerms = tokenize(query);
      if (queryTerms.length === 0 || sectionCount === 0) return [];

      // Array.prototype.sort is stable (guaranteed since ES2019), and
      // `indexed` is built in a fixed order (documents, then their
      // sections, both as loaded), so equal-score results keep that order
      // deterministically rather than depending on an explicit tiebreaker.
      const scored = indexed.map((s) => {
        let score = 0;
        for (const term of queryTerms) {
          const termFrequency = s.termFrequencies.get(term) ?? 0;
          if (termFrequency === 0) continue;
          const numerator = termFrequency * (K1 + 1);
          const denominator = termFrequency + K1 * (1 - B + (B * s.length) / (averageLength || 1));
          score += idf(term) * (numerator / denominator);
        }
        return {
          documentId: s.documentId,
          documentTitle: s.documentTitle,
          section: s.section,
          score,
        };
      });

      return scored
        .filter((result) => result.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    },
  };
}
