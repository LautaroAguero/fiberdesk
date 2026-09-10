import { describe, expect, test } from "vitest";

import { searchDocumentation } from "@/lib/assistant/documentation-search";
import { buildSearchIndex } from "@/lib/corpus/search";
import type { Corpus } from "@/lib/corpus/types";

function fixtureIndex() {
  const corpus: Corpus = [
    {
      id: "a.md",
      title: "A",
      sections: [{ title: "Cascaded splitter loss", paragraphs: ["Cascades add insertion loss."] }],
    },
  ];
  return buildSearchIndex(corpus);
}

describe("5.1 the documentation search adapter", () => {
  test("a matching query returns citable search_result blocks", () => {
    const blocks = searchDocumentation(fixtureIndex(), "cascaded splitter insertion loss");

    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0].type).toBe("search_result");
    expect(blocks[0].source).toBe("a.md");
    expect(blocks[0].citations).toEqual({ enabled: true });
  });

  test("a query matching nothing returns an empty array", () => {
    expect(searchDocumentation(fixtureIndex(), "xylophone quasar")).toEqual([]);
  });
});
