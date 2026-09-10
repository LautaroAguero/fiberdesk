import { describe, expect, test } from "vitest";

import { buildSearchIndex, DEFAULT_RESULT_LIMIT } from "@/lib/corpus/search";
import type { Corpus } from "@/lib/corpus/types";

/** A small, hand-built corpus whose relevance ordering is obvious by inspection. */
function fixtureCorpus(): Corpus {
  return [
    {
      id: "splitters.md",
      title: "Splitters",
      sections: [
        {
          title: "Cascaded splitter loss",
          paragraphs: [
            "When a splitter cascades off another splitter, the insertion loss of both stages adds.",
            "Cascaded splitter loss is the most common reason a link ends up marginal.",
          ],
        },
        {
          title: "Connectors",
          paragraphs: [
            "A connector pair typically contributes a small, fixed insertion loss.",
            "Cleanliness affects connector loss more than the connector type does.",
          ],
        },
      ],
    },
    {
      id: "installation.md",
      title: "Installation Practice",
      sections: [
        {
          title: "Enclosure mounting",
          paragraphs: [
            "A splitter is usually mounted in a weatherproof enclosure near the pole.",
            "Mounting height should keep the enclosure above expected flood levels.",
          ],
        },
      ],
    },
  ];
}

describe("3.1 tokenisation and index build", () => {
  test("term frequency counts repeated terms within a section", () => {
    const index = buildSearchIndex(fixtureCorpus());
    // "cascaded" appears in the section title and in one paragraph of the
    // first section, and nowhere near as densely elsewhere — it should rank
    // that section first for a query naming it.
    const results = index.search("cascaded splitter loss");
    expect(results[0].section.title).toBe("Cascaded splitter loss");
  });

  test("document frequency spans documents, not just one", () => {
    const index = buildSearchIndex(fixtureCorpus());
    // "splitter" appears in a section of both documents, so a query for it
    // should find results in both rather than being scoped to one.
    const results = index.search("splitter");
    const sourceDocs = new Set(results.map((r) => r.documentId));
    expect(sourceDocs.size).toBeGreaterThan(1);
  });
});

describe("3.2 BM25 scoring and the result limit", () => {
  test("a section that discusses the query topic outranks one that mentions it in passing", () => {
    const index = buildSearchIndex(fixtureCorpus());
    const results = index.search("splitter insertion loss cascade");

    const titles = results.map((r) => r.section.title);
    expect(titles[0]).toBe("Cascaded splitter loss");
    expect(titles).not.toEqual([]);
    // "Connectors" mentions loss only in passing and should not outrank it.
    const cascadeRank = titles.indexOf("Cascaded splitter loss");
    const connectorsRank = titles.indexOf("Connectors");
    if (connectorsRank !== -1) {
      expect(cascadeRank).toBeLessThan(connectorsRank);
    }
  });

  test("no more than the documented maximum is returned", () => {
    const index = buildSearchIndex(fixtureCorpus());
    const results = index.search("splitter", 1);
    expect(results.length).toBeLessThanOrEqual(1);
  });

  test("the default limit is applied when none is given", () => {
    const index = buildSearchIndex(fixtureCorpus());
    const results = index.search("splitter loss connector cascade");
    expect(results.length).toBeLessThanOrEqual(DEFAULT_RESULT_LIMIT);
  });
});

describe("3.3 determinism and the empty case", () => {
  test("the same query run twice returns identical ordered results", () => {
    const index = buildSearchIndex(fixtureCorpus());
    const first = index.search("cascaded splitter loss");
    const second = index.search("cascaded splitter loss");
    expect(first).toEqual(second);
  });

  test("a query matching nothing returns an empty list, not an error", () => {
    const index = buildSearchIndex(fixtureCorpus());
    expect(() => index.search("xylophone quasar nonexistent")).not.toThrow();
    expect(index.search("xylophone quasar nonexistent")).toEqual([]);
  });

  test("an empty corpus never throws", () => {
    const index = buildSearchIndex([]);
    expect(index.search("anything")).toEqual([]);
  });
});
