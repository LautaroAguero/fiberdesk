/**
 * The model settings every assistant turn runs with.
 *
 * One module, imported by both the chat route and the eval runner, so the
 * eval measures exactly what the app serves — see design.md
 * (add-eval-harness), decision 2. Changing a value here changes both.
 *
 * The values themselves were chosen in add-conversational-layer, design.md,
 * decision 7: they exist for a streamed, thirty-second demo, not for output
 * quality, and low effort serves this domain.
 */

/** The model the assistant calls. */
export const MODEL = "claude-opus-5";

/** Output token ceiling per model call. Streaming, so a long answer does not time out. */
export const MAX_TOKENS = 4096;

/** Reasoning depth. */
export const EFFORT = "low" as const;

/**
 * Adaptive thinking, with a readable summary streamed back so the user sees
 * the model working rather than a silent pause.
 */
export const THINKING = { type: "adaptive", display: "summarized" } as const;

/**
 * Marks the tool definitions and system prompt as a cacheable prefix, and
 * lets the growing conversation cache after it. Billing only: the model reads
 * the same bytes either way. See design.md (reduce-cost-per-question),
 * decision 2; `false` turns it off without reverting anything else.
 */
export const PROMPT_CACHING = true;
