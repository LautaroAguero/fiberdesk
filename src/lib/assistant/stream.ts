/**
 * Server-Sent Events encoding for {@link AssistantEvent}, and the
 * `ReadableStream` that wires an event-emitting run into an HTTP response.
 *
 * See design.md, decision 6: the stream carries three kinds of event —
 * prose, tool activity, the terminal map payload — plus errors as their own
 * event type rather than a silently truncated stream.
 */

import type { AssistantEvent } from "@/lib/assistant/events";

/** One SSE frame: `event: <type>` line, a `data: <json>` line, then a blank line. */
export function encodeSseEvent(event: AssistantEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/** The inverse of {@link encodeSseEvent}. Test-only — production code never decodes its own output. */
export function decodeSseEvent(frame: string): AssistantEvent {
  const dataLine = frame.split("\n").find((line) => line.startsWith("data: "));
  if (dataLine === undefined) {
    throw new Error(`Not a valid SSE frame (no data line): ${frame}`);
  }
  return JSON.parse(dataLine.slice("data: ".length)) as AssistantEvent;
}

/**
 * Builds the `ReadableStream` an `/api/chat` response body returns.
 *
 * `run` receives an `emit` function and is expected to call it for every
 * event of the turn, including the terminal `"done"` event — nothing enqueued
 * after that point reaches the client, because `run` is expected to return
 * once it has emitted it. If `run` throws — an upstream failure after
 * streaming has begun — an `"error"` event is emitted before the stream
 * closes, rather than truncating it silently.
 */
export function createSseStream(
  run: (emit: (event: AssistantEvent) => void) => Promise<void>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: AssistantEvent) => {
        controller.enqueue(encoder.encode(encodeSseEvent(event)));
      };

      try {
        await run(emit);
      } catch (error) {
        emit({ type: "error", message: error instanceof Error ? error.message : String(error) });
      } finally {
        controller.close();
      }
    },
  });
}
