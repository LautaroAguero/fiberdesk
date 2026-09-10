/**
 * POST /api/chat — the one endpoint the chat page talks to.
 *
 * Pure wiring: loads the network, builds the tools, drives the manual loop
 * (`@/lib/assistant/loop`) inside an SSE stream (`@/lib/assistant/stream`),
 * and projects the map payload (`@/lib/assistant/highlight`) once the loop
 * finishes. Every piece it calls has its own tests; this file does not, by
 * design — see design.md, decision 8.
 */

import type Anthropic from "@anthropic-ai/sdk";

import { runAssistantLoop } from "@/lib/assistant/loop";
import { createAnthropicClient, createModelClient } from "@/lib/assistant/model-client";
import { projectHighlight } from "@/lib/assistant/highlight";
import { createSseStream } from "@/lib/assistant/stream";
import { SYSTEM_PROMPT } from "@/lib/assistant/system-prompt";
import { buildToolDefinitions } from "@/lib/assistant/tool-definitions";
import { buildSearchIndex } from "@/lib/corpus/search";
import { loadCorpus } from "@/lib/corpus/load";
import { loadNetwork } from "@/lib/network/load";

const MODEL = "claude-opus-5";

// Streaming, so the effort and thinking-display settings below are actually
// visible to the user rather than arriving as one silent pause. See
// design.md, decision 7 — these three settings exist for the thirty-second
// demo, not for output quality.
const MAX_TOKENS = 4096;
const EFFORT = "low" as const;

interface ChatRequestBody {
  messages: Anthropic.MessageParam[];
}

function isChatRequestBody(value: unknown): value is ChatRequestBody {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as ChatRequestBody).messages) &&
    (value as ChatRequestBody).messages.length > 0
  );
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  if (!isChatRequestBody(body)) {
    return Response.json(
      { error: "Request body must include a non-empty `messages` array." },
      { status: 400 },
    );
  }

  // A failure here happens before any bytes are sent, so it is a normal HTTP
  // error rather than an SSE event. Only a failure DURING streaming becomes
  // an "error" event — see specs/network-assistant/spec.md, "Failures reach
  // the user rather than being swallowed".
  let network: ReturnType<typeof loadNetwork>;
  let searchIndex: ReturnType<typeof buildSearchIndex>;
  let client: ReturnType<typeof createModelClient>;
  try {
    network = loadNetwork();
    searchIndex = buildSearchIndex(loadCorpus());
    client = createModelClient(createAnthropicClient());
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }

  const tools = buildToolDefinitions(network);
  const messages = body.messages;

  const stream = createSseStream(async (emit) => {
    const result = await runAssistantLoop({
      client,
      model: MODEL,
      maxTokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools,
      network,
      searchIndex,
      messages,
      effort: EFFORT,
      onEvent: emit,
    });

    emit({ type: "done", payload: projectHighlight(result.toolCalls), messages: result.messages });
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
