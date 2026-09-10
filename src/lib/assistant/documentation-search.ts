/**
 * Adapts `@/lib/corpus/search` into what the `search_documentation` tool
 * returns: the ranked sections, mapped to citable `search_result` blocks.
 *
 * Mirrors `budgets.ts`'s role for the optical engine — a thin seam between
 * the tool surface and the module that actually does the work.
 */

import type Anthropic from "@anthropic-ai/sdk";

import type { SearchIndex } from "@/lib/corpus/search";
import { toSearchResultBlocks } from "@/lib/corpus/search-result";

/**
 * Searches `index` for `query` and returns citable `search_result` blocks,
 * highest-ranked first. An empty array means the documentation does not
 * cover the topic — not an error.
 */
export function searchDocumentation(index: SearchIndex, query: string): Anthropic.SearchResultBlockParam[] {
  return toSearchResultBlocks(index.search(query));
}
