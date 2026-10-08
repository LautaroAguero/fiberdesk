/**
 * The citation grader: an answer drawn from the documentation must point to
 * where it came from — either through the API's native citations, or by
 * naming a document the search tool actually returned this turn.
 */

import type { GradedTurn } from "@/lib/evals/graders/input";
import type { GraderResult } from "@/lib/evals/types";

/** `source` and `title` of every search_result block this turn's tool calls returned. */
function returnedSources(turn: GradedTurn): Array<{ source: string; title: string }> {
  return turn.toolCalls.flatMap((call) =>
    Array.isArray(call.result)
      ? (call.result as Array<Record<string, unknown>>)
          .filter((block) => block?.type === "search_result")
          .map((block) => ({ source: String(block.source ?? ""), title: String(block.title ?? "") }))
      : [],
  );
}

export function gradeCitation(turn: GradedTurn): GraderResult {
  if (turn.citedSources.length > 0) return { pass: true, reasons: [] };

  const sources = returnedSources(turn);
  if (sources.length === 0) {
    return { pass: false, reasons: ["no citation, and the search returned no document to name"] };
  }

  const answer = turn.answer.toLowerCase();
  const named = sources.some(({ source, title }) =>
    [source, source.replace(/\.md$/, ""), title]
      .filter((name) => name.length > 0)
      .some((name) => answer.includes(name.toLowerCase())),
  );
  return named
    ? { pass: true, reasons: [] }
    : { pass: false, reasons: ["the answer neither cites nor names any document the search returned"] };
}
