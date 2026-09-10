/**
 * Acceptance tests for the committed corpus under `corpus/`.
 *
 * These assert that the real corpus still has the shape the spec requires:
 * it loads, its deliberate gap and contradiction are present, and the
 * ranking scenario named in the spec actually holds against real text —
 * not just against the hand-built fixtures in search.test.ts. Mirrors the
 * role `@/lib/network/dataset.test.ts` plays for the network dataset.
 */

import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { loadCorpus, CORPUS_DIR } from "@/lib/corpus/load";
import { buildSearchIndex } from "@/lib/corpus/search";
import { FIBER_DB_PER_KM } from "@/lib/optical/constants";
import path from "node:path";

const corpus = loadCorpus();
const index = buildSearchIndex(corpus);

describe("The corpus loads", () => {
  test("between 3 and 5 documents, each with a title and at least one section", () => {
    expect(corpus.length).toBeGreaterThanOrEqual(3);
    expect(corpus.length).toBeLessThanOrEqual(5);
    for (const doc of corpus) {
      expect(doc.title).not.toBe("");
      expect(doc.sections.length).toBeGreaterThan(0);
      for (const section of doc.sections) {
        expect(section.paragraphs.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("Deliberate gaps and contradictions", () => {
  test("no document states an ONT receiver sensitivity figure", () => {
    // The concept may be mentioned, but no numeric dBm claim may accompany it.
    const filesMentioningSensitivity = corpus
      .flatMap((doc) => doc.sections.flatMap((s) => s.paragraphs.map((p) => ({ doc: doc.id, text: p }))))
      .filter(({ text }) => /sensitivity/i.test(text));

    for (const { doc, text } of filesMentioningSensitivity) {
      expect(text, `${doc} attaches a figure to "sensitivity"`).not.toMatch(/-?\d+(\.\d+)?\s*dBm/i);
    }
  });

  test("exactly one document states a fiber attenuation figure that disagrees with the constant", () => {
    const matches = corpus.filter((doc) =>
      doc.sections.some((s) => s.paragraphs.some((p) => p.includes("0.22 dB"))),
    );

    expect(matches).toHaveLength(1);
    expect(FIBER_DB_PER_KM).toBe(0.25);
    expect(0.22).not.toBe(FIBER_DB_PER_KM);
  });
});

describe("Ranked retrieval against the real corpus", () => {
  test("cascaded splitter loss outranks a passing mention of splitters", () => {
    const results = index.search("splitter insertion loss cascade");
    expect(results[0].section.title).toBe("Cascaded Splitter Loss");

    const cascadeRank = results.findIndex((r) => r.section.title === "Cascaded Splitter Loss");
    const passingMentionRank = results.findIndex((r) => r.section.title === "Enclosure Mounting");
    if (passingMentionRank !== -1) {
      expect(cascadeRank).toBeLessThan(passingMentionRank);
    }
  });

  test("an English query about moisture finds the environmental factors section", () => {
    const results = index.search("moisture water absorption attenuation fiber");
    expect(results[0].section.title).toBe("Environmental Factors");
  });
});

describe("Documents are identified by their file name", () => {
  test("every source document referenced actually exists on disk under CORPUS_DIR", () => {
    for (const doc of corpus) {
      expect(() => readFileSync(path.join(CORPUS_DIR, doc.id))).not.toThrow();
    }
  });
});
