/**
 * Readers for fields a run record may lack because it predates them.
 *
 * Every reader of such a field goes through here, so the default for an old
 * record is decided once. See design.md (reduce-cost-per-question), decision 2.
 */

import type { RunRecord } from "@/lib/evals/types";

/**
 * Whether the run sent prompt-cache markers. A record written before the
 * field existed was an uncached run.
 */
export function promptCachingOn(record: Pick<RunRecord, "prompt_caching">): boolean {
  return record.prompt_caching === true;
}
