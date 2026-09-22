"use client";

/**
 * The chat page. Deliberately plain — an input, a transcript, text arriving
 * token by token — so Phase 1 is demonstrable without pre-empting Phase 3's
 * map. See proposal.md and design.md's Risks/Trade-offs.
 *
 * Conversation state lives here, in the tab, and nowhere else — there is no
 * server-side session. Each POST /api/chat response ends with a "done"
 * event carrying the exact updated message array the server sent to the
 * model; that array becomes this page's new source of truth and is resent
 * verbatim on the next question, tool_use/tool_result blocks intact. See
 * events.ts for why the array travels this way instead of being
 * reconstructed from the streamed text and tool events.
 */

import { useRef, useState } from "react";
import type Anthropic from "@anthropic-ai/sdk";

import type { AssistantEvent, HighlightPayload } from "@/lib/assistant/events";
import { createFrameSplitter, decodeSseEvent } from "@/lib/assistant/stream";

/** One line of the visible transcript. Derived from `history`, never the other way round. */
interface DisplayTurn {
  role: "user" | "assistant";
  text: string;
}

/** One line of "what the assistant is doing", shown while a tool call is in flight. */
interface ActivityLine {
  toolUseId: string;
  name: string;
  status: "running" | "done" | "error";
}

function toolActivityLabel(name: string): string {
  if (name === "summarize_optical_budgets") return "Surveying every NAP";
  if (name === "detail_optical_budget") return "Pulling the detailed breakdown";
  return name;
}

export default function ChatPage() {
  const [history, setHistory] = useState<Anthropic.MessageParam[]>([]);
  const [transcript, setTranscript] = useState<DisplayTurn[]>([]);
  const [activity, setActivity] = useState<ActivityLine[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastHighlight, setLastHighlight] = useState<HighlightPayload | null>(null);
  const streamingTextRef = useRef("");

  async function sendMessage(question: string) {
    setError(null);
    setActivity([]);
    setIsStreaming(true);
    streamingTextRef.current = "";

    const nextHistory: Anthropic.MessageParam[] = [...history, { role: "user", content: question }];
    setTranscript((prev) => [...prev, { role: "user", text: question }, { role: "assistant", text: "" }]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextHistory }),
      });

      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Request failed with status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const splitter = createFrameSplitter();

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        for (const frame of splitter.push(decoder.decode(value, { stream: true }))) {
          handleEvent(decodeSseEvent(frame));
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsStreaming(false);
    }
  }

  function handleEvent(event: AssistantEvent) {
    switch (event.type) {
      case "text": {
        streamingTextRef.current += event.text;
        const text = streamingTextRef.current;
        setTranscript((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", text };
          return next;
        });
        break;
      }
      case "tool_start":
        setActivity((prev) => [...prev, { toolUseId: event.tool_use_id, name: event.name, status: "running" }]);
        break;
      case "tool_end":
        setActivity((prev) =>
          prev.map((line) =>
            line.toolUseId === event.tool_use_id
              ? { ...line, status: event.is_error ? "error" : "done" }
              : line,
          ),
        );
        break;
      case "done":
        // The map does not exist yet (Phase 3) — logging is the whole point here.
        console.log("[FiberDesk] map highlight", event.payload);
        setLastHighlight(event.payload);
        setHistory(event.messages);
        break;
      case "error":
        setError(event.message);
        break;
    }
  }

  function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    const question = input.trim();
    if (!question || isStreaming) return;
    setInput("");
    void sendMessage(question);
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-2xl flex-1 flex-col gap-4 px-6 py-8">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">FiberDesk</h1>

        <div className="flex-1 space-y-4 overflow-y-auto rounded border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          {transcript.length === 0 && (
            <p className="text-sm text-zinc-500">
              Ask something like &ldquo;which NAPs fail the optical budget?&rdquo;
            </p>
          )}
          {transcript.map((turn, index) => (
            <div key={index} className="text-sm">
              <span className="font-medium text-zinc-500">{turn.role === "user" ? "You" : "FiberDesk"}: </span>
              <span className="whitespace-pre-wrap text-black dark:text-zinc-50">{turn.text}</span>
            </div>
          ))}

          {activity.length > 0 && (
            <div className="space-y-1 border-t border-zinc-100 pt-2 text-xs text-zinc-500 dark:border-zinc-800">
              {activity.map((line) => (
                <div key={line.toolUseId}>
                  {line.status === "running" && `⏳ ${toolActivityLabel(line.name)}…`}
                  {line.status === "done" && `✓ ${toolActivityLabel(line.name)}`}
                  {line.status === "error" && `⚠ ${toolActivityLabel(line.name)} failed`}
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-sm text-red-600 dark:text-red-400">Error: {error}</p>}

          {lastHighlight && lastHighlight.highlight.length > 0 && (
            <p className="border-t border-zinc-100 pt-2 text-xs text-zinc-400 dark:border-zinc-800">
              Map highlight logged to the console — drawing it is Phase 3. NAPs:{" "}
              {lastHighlight.highlight.map((entry) => entry.nap_id).join(", ")}.
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            className="flex-1 rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-black dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
            value={input}
            onChange={(inputEvent) => setInput(inputEvent.target.value)}
            placeholder="Ask about the network..."
            disabled={isStreaming}
          />
          <button
            type="submit"
            className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-black"
            disabled={isStreaming || input.trim() === ""}
          >
            {isStreaming ? "Asking…" : "Ask"}
          </button>
        </form>
      </main>
    </div>
  );
}
