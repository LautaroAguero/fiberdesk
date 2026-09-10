/**
 * Reads the documentation corpus from disk.
 *
 * Server-only, same reasoning as `@/lib/network/load`: the corpus is read
 * with `fs`, never imported as a module, so it can never end up in a client
 * bundle.
 *
 * Loading is all-or-nothing across the whole corpus, not just within one
 * file: every document's issues are collected before anything is thrown, the
 * same "report every problem, not just the first" approach
 * `@/lib/network/validate` uses.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { CorpusValidationError, parseDocument, type CorpusValidationIssue } from "@/lib/corpus/validate";
import type { Corpus } from "@/lib/corpus/types";

/** Location of the corpus, relative to the project root. */
export const CORPUS_DIR = path.join(process.cwd(), "corpus");

/**
 * Reads every `.md` file in `dir`, parses and validates each, and either
 * returns the whole corpus or throws {@link CorpusValidationError} naming
 * every issue found. Never returns a partially loaded corpus.
 */
export function loadCorpus(dir: string = CORPUS_DIR): Corpus {
  const fileNames = readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort();

  const documents: Corpus = [];
  const allIssues: CorpusValidationIssue[] = [];
  const seenIds = new Set<string>();

  for (const fileName of fileNames) {
    const raw = readFileSync(path.join(dir, fileName), "utf8");
    const { document, issues } = parseDocument(fileName, raw);
    allIssues.push(...issues);

    if (document) {
      if (seenIds.has(document.id)) {
        allIssues.push({ entity: document.id, field: "id", message: "duplicate document id" });
      } else {
        seenIds.add(document.id);
        documents.push(document);
      }
    }
  }

  if (allIssues.length > 0) throw new CorpusValidationError(allIssues);
  return documents;
}
