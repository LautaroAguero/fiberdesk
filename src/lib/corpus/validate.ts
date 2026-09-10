/**
 * Parsing and structural validation for one corpus document.
 *
 * A Markdown document's structure and its validity are discovered in the same
 * pass — unlike JSON, there is no separate "parse, then validate" step:
 * "no title found" is simultaneously a parsing fact and a validation issue.
 * Validation is still all-or-nothing: a document with any issue yields no
 * document, only issues, mirroring `@/lib/network/validate`.
 */

/** A single rule violation, naming what broke and where. */
export interface CorpusValidationIssue {
  /** The file name, always. */
  entity: string;
  /** The offending section title or field, when attributable to one. */
  field?: string;
  message: string;
}

export class CorpusValidationError extends Error {
  readonly issues: readonly CorpusValidationIssue[];

  constructor(issues: readonly CorpusValidationIssue[]) {
    const detail = issues
      .map((i) => `  ${i.entity}${i.field ? `.${i.field}` : ""}: ${i.message}`)
      .join("\n");
    super(`Documentation corpus is invalid (${issues.length} issue(s)):\n${detail}`);
    this.name = "CorpusValidationError";
    this.issues = issues;
  }
}

import type { CorpusDocument, CorpusSection } from "@/lib/corpus/types";

const TITLE_LINE = /^#\s+(.+)$/;
const SECTION_LINE = /^##\s+(.+)$/;

/** Groups lines into paragraphs: consecutive non-blank lines joined, split on blank lines. */
function linesToParagraphs(lines: string[]): string[] {
  const paragraphs: string[] = [];
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length > 0) {
      paragraphs.push(buffer.join(" ").trim());
      buffer = [];
    }
  };

  for (const line of lines) {
    if (line.trim() === "") {
      flush();
    } else {
      buffer.push(line.trim());
    }
  }
  flush();

  return paragraphs.filter((p) => p !== "");
}

/**
 * Parses one document's raw Markdown. Returns either a fully valid document
 * or a non-empty list of issues — never a partial document with unreported
 * problems.
 */
export function parseDocument(
  fileName: string,
  raw: string,
): { document: CorpusDocument | null; issues: CorpusValidationIssue[] } {
  const issues: CorpusValidationIssue[] = [];
  const lines = raw.split(/\r?\n/);

  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;

  const titleMatch = i < lines.length ? TITLE_LINE.exec(lines[i].trim()) : null;
  if (!titleMatch) {
    issues.push({
      entity: fileName,
      field: "title",
      message: 'must start with a level-1 heading ("# Title")',
    });
    return { document: null, issues };
  }

  const title = titleMatch[1].trim();
  if (title === "") {
    issues.push({ entity: fileName, field: "title", message: "must not be empty" });
  }
  i++;

  const sections: CorpusSection[] = [];
  let current: { title: string; lines: string[] } | null = null;

  const flushCurrentSection = () => {
    if (!current) return;
    const paragraphs = linesToParagraphs(current.lines);
    if (paragraphs.length === 0) {
      issues.push({ entity: fileName, field: current.title, message: "section has no content" });
    } else {
      sections.push({ title: current.title, paragraphs });
    }
  };

  for (; i < lines.length; i++) {
    const line = lines[i];
    const sectionMatch = SECTION_LINE.exec(line.trim());

    if (sectionMatch) {
      flushCurrentSection();
      const sectionTitle = sectionMatch[1].trim();
      if (sectionTitle === "") {
        issues.push({ entity: fileName, field: "section", message: "a section heading is empty" });
      }
      current = { title: sectionTitle, lines: [] };
    } else if (current) {
      current.lines.push(line);
    } else if (line.trim() !== "") {
      issues.push({
        entity: fileName,
        message: `content appears before any "##" section: ${JSON.stringify(line.trim().slice(0, 40))}`,
      });
    }
  }
  flushCurrentSection();

  if (sections.length === 0) {
    issues.push({ entity: fileName, field: "sections", message: 'must contain at least one "##" section' });
  }

  if (issues.length > 0) return { document: null, issues };

  return { document: { id: fileName, title, sections }, issues: [] };
}
