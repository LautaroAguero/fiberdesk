import { describe, expect, test } from "vitest";

import { createFrameSplitter, createSseStream, decodeSseEvent, encodeSseEvent } from "@/lib/assistant/stream";
import type { AssistantEvent } from "@/lib/assistant/events";

/** Reads every event out of a stream built by createSseStream, fully draining it. */
async function readAllEvents(stream: ReadableStream<Uint8Array>): Promise<AssistantEvent[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events: AssistantEvent[] = [];

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
  }

  for (const frame of buffer.split("\n\n").filter((f) => f.trim() !== "")) {
    events.push(decodeSseEvent(frame));
  }
  return events;
}

const SAMPLE_EVENTS: AssistantEvent[] = [
  { type: "text", text: "hello" },
  { type: "tool_start", tool_use_id: "toolu_1", name: "summarize_optical_budgets", input: {} },
  { type: "tool_end", tool_use_id: "toolu_1", name: "summarize_optical_budgets", is_error: false },
  {
    type: "done",
    payload: { highlight: [{ nap_id: "NAP-12", status: "marginal", margin_db: 2.77 }], fit_bounds: true },
    messages: [{ role: "user", content: "which fail?" }],
  },
  { type: "error", message: "something went wrong" },
];

describe("5.1 SSE encoding round-trips every event variant", () => {
  test.each(SAMPLE_EVENTS)("%o", (event) => {
    expect(decodeSseEvent(encodeSseEvent(event))).toEqual(event);
  });

  test("each frame has an event line, a data line, and a trailing blank line", () => {
    const frame = encodeSseEvent({ type: "text", text: "hi" });
    expect(frame).toBe('event: text\ndata: {"type":"text","text":"hi"}\n\n');
  });
});

describe("5.2 the loop's events reach the stream in order", () => {
  test("a tool's start precedes its completion", async () => {
    const stream = createSseStream(async (emit) => {
      emit({ type: "tool_start", tool_use_id: "toolu_1", name: "detail_optical_budget", input: { nap_id: "NAP-09" } });
      emit({ type: "tool_end", tool_use_id: "toolu_1", name: "detail_optical_budget", is_error: false });
      emit({ type: "done", payload: { highlight: [], fit_bounds: false }, messages: [] });
    });

    const events = await readAllEvents(stream);
    expect(events.map((e) => e.type)).toEqual(["tool_start", "tool_end", "done"]);
  });

  test("the terminal payload is last, with nothing after it", async () => {
    const stream = createSseStream(async (emit) => {
      emit({ type: "text", text: "NAP-09 fails." });
      emit({ type: "done", payload: { highlight: [], fit_bounds: false }, messages: [] });
    });

    const events = await readAllEvents(stream);
    expect(events.at(-1)?.type).toBe("done");
  });

  test("a thrown error mid-run becomes an error event rather than a truncated stream", async () => {
    const stream = createSseStream(async (emit) => {
      emit({ type: "text", text: "partial" });
      throw new Error("upstream request failed");
    });

    const events = await readAllEvents(stream);
    expect(events.map((e) => e.type)).toEqual(["text", "error"]);
    expect((events[1] as { message: string }).message).toContain("upstream request failed");
  });
});

describe("2.4 createFrameSplitter", () => {
  test("a frame split across two chunks is only returned once the second chunk arrives", () => {
    const splitter = createFrameSplitter();
    const frame = encodeSseEvent({ type: "text", text: "hello" });
    const midpoint = Math.floor(frame.length / 2);

    expect(splitter.push(frame.slice(0, midpoint))).toEqual([]);
    expect(splitter.push(frame.slice(midpoint))).toEqual([frame.trimEnd()]);
  });

  test("two frames delivered in one chunk are both returned", () => {
    const splitter = createFrameSplitter();
    const first = encodeSseEvent({ type: "text", text: "one" });
    const second = encodeSseEvent({ type: "text", text: "two" });

    expect(splitter.push(first + second)).toEqual([first.trimEnd(), second.trimEnd()]);
  });

  test("blank frames are dropped", () => {
    const splitter = createFrameSplitter();

    expect(splitter.push("\n\n\n\n")).toEqual([]);
  });

  test("a trailing partial frame is held back until it completes", () => {
    const splitter = createFrameSplitter();
    const complete = encodeSseEvent({ type: "text", text: "done" });
    const partial = "event: text\ndata: {\"type\":\"text\"";

    expect(splitter.push(complete + partial)).toEqual([complete.trimEnd()]);
    expect(splitter.push("")).toEqual([]);
  });
});
