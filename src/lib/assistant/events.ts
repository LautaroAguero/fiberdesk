/**
 * The events the assistant loop reports as a turn progresses, and the shape
 * of the terminal map payload. See design.md, decision 6 — the stream
 * carries three kinds of event, plus errors as their own type rather than a
 * silently truncated stream.
 *
 * `HighlightPayload`'s two fields are exactly `{ highlight, fit_bounds }` —
 * the JSON contract the map (Phase 3) will read.
 *
 * The `done` event also carries the full updated message array. There is no
 * server-side conversation store — history lives in the browser tab, per
 * proposal.md's non-goals — so this is how the client gets back a message
 * array with the real tool_use/tool_result blocks intact, fit to resend
 * verbatim as `messages` on the next request. Reconstructing that array
 * from the streamed text/tool events alone would mean re-deriving block ids
 * and inputs the client never actually needs to know; sending the array the
 * server already built is simpler and cannot drift from what was really
 * sent to the model.
 */

import type Anthropic from "@anthropic-ai/sdk";

/** One NAP the map should draw attention to, with the figures that justify it. */
export interface HighlightEntry {
  nap_id: string;
  status: "pass" | "marginal" | "fail";
  margin_db: number;
}

/** The terminal payload of a turn — see design.md, decision 5: projected, never emitted. */
export interface HighlightPayload {
  highlight: HighlightEntry[];
  fit_bounds: boolean;
}

export type AssistantEvent =
  | { type: "text"; text: string }
  | { type: "tool_start"; tool_use_id: string; name: string; input: unknown }
  | { type: "tool_end"; tool_use_id: string; name: string; is_error: boolean }
  | { type: "done"; payload: HighlightPayload; messages: Anthropic.MessageParam[] }
  | { type: "error"; message: string };
