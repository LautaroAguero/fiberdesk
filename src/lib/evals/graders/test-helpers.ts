/**
 * Test-only helpers for the graders: a {@link GradedTurn} built from real
 * dispatches against the seed, so tool results are exactly what the live
 * loop would see. Never used by production code.
 */

import { dispatchTool } from "@/lib/assistant/dispatcher";
import { projectHighlight } from "@/lib/assistant/highlight";
import type { ToolCallRecord } from "@/lib/assistant/loop";
import { loadCorpus } from "@/lib/corpus/load";
import { buildSearchIndex } from "@/lib/corpus/search";
import { loadNetwork } from "@/lib/network/load";
import type { GradedTurn } from "@/lib/evals/graders/input";

export const network = loadNetwork();
export const searchIndex = buildSearchIndex(loadCorpus());

/** A ToolCallRecord the way loop.ts builds one, from a real dispatch. */
export function call(name: string, input: unknown, iteration = 1): ToolCallRecord {
  const { content, isError } = dispatchTool(name, input, network, searchIndex);
  return {
    name,
    input,
    result: isError ? null : typeof content === "string" ? JSON.parse(content) : content,
    isError,
    iteration,
  };
}

export function turn(overrides: Partial<GradedTurn> & { answer: string }): GradedTurn {
  const toolCalls = overrides.toolCalls ?? [];
  return {
    citedSources: [],
    priorToolCalls: [],
    userMessages: [],
    payload: projectHighlight(toolCalls),
    ...overrides,
    toolCalls,
  };
}
