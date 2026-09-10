import { describe, expect, test } from "vitest";

import { parseDocument } from "@/lib/corpus/validate";

describe("2.1 parsing a well-formed document", () => {
  test("a title and one section with one paragraph", () => {
    const raw = "# GPON Link Budget\n\n## Overview\n\nThe link budget sums every loss source.\n";
    const { document, issues } = parseDocument("overview.md", raw);

    expect(issues).toEqual([]);
    expect(document).toEqual({
      id: "overview.md",
      title: "GPON Link Budget",
      sections: [{ title: "Overview", paragraphs: ["The link budget sums every loss source."] }],
    });
  });

  test("multiple sections, each with multiple paragraphs", () => {
    const raw = [
      "# Splitters",
      "",
      "## Ratios",
      "",
      "A splitter divides optical power.",
      "It comes in several ratios.",
      "",
      "Each ratio has a different loss.",
      "",
      "## Cascades",
      "",
      "A NAP can hang off another NAP.",
    ].join("\n");

    const { document, issues } = parseDocument("splitters.md", raw);

    expect(issues).toEqual([]);
    expect(document?.sections).toHaveLength(2);
    expect(document?.sections[0]).toEqual({
      title: "Ratios",
      paragraphs: [
        "A splitter divides optical power. It comes in several ratios.",
        "Each ratio has a different loss.",
      ],
    });
    expect(document?.sections[1].title).toBe("Cascades");
  });
});

describe("2.2 structural validation", () => {
  test("a missing title is rejected, naming the file", () => {
    const { document, issues } = parseDocument("no-title.md", "## Just a section\n\nSome text.\n");

    expect(document).toBeNull();
    expect(issues).toEqual([
      { entity: "no-title.md", field: "title", message: 'must start with a level-1 heading ("# Title")' },
    ]);
  });

  test("a document with no sections is rejected", () => {
    const { document, issues } = parseDocument("no-sections.md", "# A Title\n\nJust prose, no heading.\n");

    expect(document).toBeNull();
    expect(issues.some((i) => i.field === "sections")).toBe(true);
  });

  test("an empty section is rejected, naming the section", () => {
    const raw = "# A Title\n\n## Empty Section\n\n## Real Section\n\nContent here.\n";
    const { document, issues } = parseDocument("empty-section.md", raw);

    expect(document).toBeNull();
    expect(issues).toContainEqual({
      entity: "empty-section.md",
      field: "Empty Section",
      message: "section has no content",
    });
  });

  test("content before the first section heading is rejected", () => {
    const raw = "# A Title\n\nStray text with no section.\n\n## Real Section\n\nContent.\n";
    const { document, issues } = parseDocument("stray-content.md", raw);

    expect(document).toBeNull();
    expect(issues[0].message).toContain("appears before any");
  });

  test("multiple issues in one file are all reported, not just the first", () => {
    const raw = "# A Title\n\n## Empty\n\n## Also Empty\n\n";
    const { issues } = parseDocument("multi-issue.md", raw);

    // Both empty sections are named individually — not just the first one found.
    expect(issues).toContainEqual({ entity: "multi-issue.md", field: "Empty", message: "section has no content" });
    expect(issues).toContainEqual({
      entity: "multi-issue.md",
      field: "Also Empty",
      message: "section has no content",
    });
  });
});

describe("2.3 document identity", () => {
  test("the document id is the file name, stable across repeated parses", () => {
    const raw = "# Title\n\n## Section\n\nContent.\n";
    const first = parseDocument("stable-id.md", raw).document;
    const second = parseDocument("stable-id.md", raw).document;

    expect(first?.id).toBe("stable-id.md");
    expect(first?.id).toBe(second?.id);
  });
});
