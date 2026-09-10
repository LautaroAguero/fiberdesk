import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { loadCorpus } from "@/lib/corpus/load";
import { CorpusValidationError } from "@/lib/corpus/validate";

const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "test-fixtures");
const VALID_CORPUS_DIR = path.join(FIXTURES_DIR, "valid-corpus");
const INVALID_CORPUS_DIR = path.join(FIXTURES_DIR, "invalid-corpus");

describe("2.1 loading a corpus directory", () => {
  test("returns every valid document", () => {
    const corpus = loadCorpus(VALID_CORPUS_DIR);

    expect(corpus).toHaveLength(2);
    expect(corpus.map((d) => d.id).sort()).toEqual(["alpha.md", "beta.md"]);
    expect(corpus.every((d) => d.title !== "" && d.sections.length > 0)).toBe(true);
  });
});

describe("2.2 loading fails loudly", () => {
  test("a corpus with an invalid document throws, naming the file", () => {
    expect(() => loadCorpus(INVALID_CORPUS_DIR)).toThrow(CorpusValidationError);
    try {
      loadCorpus(INVALID_CORPUS_DIR);
    } catch (error) {
      const issues = (error as CorpusValidationError).issues;
      expect(issues.some((i) => i.entity === "broken.md")).toBe(true);
    }
  });

  test("no partial corpus is returned on failure", () => {
    let returned: unknown = "sentinel";
    expect(() => {
      returned = loadCorpus(INVALID_CORPUS_DIR);
    }).toThrow();
    expect(returned).toBe("sentinel");
  });
});

describe("2.3 document identity is stable across loads", () => {
  test("the same corpus loaded twice reports the same ids", () => {
    const first = loadCorpus(VALID_CORPUS_DIR).map((d) => d.id);
    const second = loadCorpus(VALID_CORPUS_DIR).map((d) => d.id);
    expect(first).toEqual(second);
  });
});
