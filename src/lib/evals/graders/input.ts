/**
 * What every grader sees of the turn it judges. Built by the runner from the
 * live turn, or by a test from fixtures — graders never call anything.
 */

import type Anthropic from "@anthropic-ai/sdk";

import type { HighlightPayload } from "@/lib/assistant/events";
import type { ToolCallRecord } from "@/lib/assistant/loop";

export interface GradedTurn {
  /** Every text block the assistant produced this turn, in order — what the user read. */
  answer: string;
  /** Document titles or sources the turn's text blocks cite natively. */
  citedSources: string[];
  /** This turn's tool calls, with parsed results and iterations. */
  toolCalls: ToolCallRecord[];
  /** Tool calls from earlier turns of the same conversation — still in the model's context. */
  priorToolCalls: ToolCallRecord[];
  /** Every user message so far, this turn's included. */
  userMessages: string[];
  /** The tool definitions the model was given — written by code, so a figure they state is grounded. */
  toolDefinitions: Anthropic.Tool[];
  /** The payload the server projected for this turn. */
  payload: HighlightPayload;
}
