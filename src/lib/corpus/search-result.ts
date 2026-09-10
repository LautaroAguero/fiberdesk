/**
 * Maps a ranked section to the `search_result` content block the Messages
 * API expects, with citations enabled.
 *
 * Each paragraph becomes its own text block. This is not a formatting choice
 * — the block is the smallest unit a citation can point at, so how a section
 * is split here is the precision of every citation drawn from it. See
 * design.md, decision 2.
 */

import type Anthropic from "@anthropic-ai/sdk";

import type { RankedSection } from "@/lib/corpus/search";

export function toSearchResultBlock(ranked: RankedSection): Anthropic.SearchResultBlockParam {
  return {
    type: "search_result",
    source: ranked.documentId,
    title: ranked.section.title,
    content: ranked.section.paragraphs.map((text) => ({ type: "text" as const, text })),
    citations: { enabled: true },
  };
}

export function toSearchResultBlocks(ranked: RankedSection[]): Anthropic.SearchResultBlockParam[] {
  return ranked.map(toSearchResultBlock);
}
