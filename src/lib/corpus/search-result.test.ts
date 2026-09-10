import { describe, expect, test } from "vitest";

import { toSearchResultBlock, toSearchResultBlocks } from "@/lib/corpus/search-result";
import type { RankedSection } from "@/lib/corpus/search";

function makeRanked(overrides: Partial<RankedSection> = {}): RankedSection {
  return {
    documentId: "gpon-link-budget.md",
    documentTitle: "GPON Link Budget",
    section: {
      title: "Cascaded splitters",
      paragraphs: ["First paragraph.", "Second paragraph.", "Third paragraph.", "Fourth paragraph."],
    },
    score: 4.2,
    ...overrides,
  };
}

describe("4.1 mapping a ranked section to a citable search result", () => {
  test("carries the source document and the section title", () => {
    const block = toSearchResultBlock(makeRanked());

    expect(block.type).toBe("search_result");
    expect(block.source).toBe("gpon-link-budget.md");
    expect(block.title).toBe("Cascaded splitters");
  });

  test("citations are enabled", () => {
    const block = toSearchResultBlock(makeRanked());
    expect(block.citations).toEqual({ enabled: true });
  });

  test("a four-paragraph section yields four separate content blocks", () => {
    const block = toSearchResultBlock(makeRanked());

    expect(block.content).toHaveLength(4);
    expect(block.content.map((b) => b.text)).toEqual([
      "First paragraph.",
      "Second paragraph.",
      "Third paragraph.",
      "Fourth paragraph.",
    ]);
    expect(block.content.every((b) => b.type === "text")).toBe(true);
  });

  test("toSearchResultBlocks maps a whole list, preserving order", () => {
    const ranked = [
      makeRanked({ documentId: "a.md", section: { title: "First", paragraphs: ["x"] } }),
      makeRanked({ documentId: "b.md", section: { title: "Second", paragraphs: ["y"] } }),
    ];

    const blocks = toSearchResultBlocks(ranked);

    expect(blocks.map((b) => b.source)).toEqual(["a.md", "b.md"]);
  });
});
