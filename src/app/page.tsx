"use client";

/**
 * Transitional wrapper around `ChatPanel` — see design.md, decision 4. This
 * file becomes a server component in task 5.3, once `Copilot` (the map plus
 * this panel) exists to render instead. Until then it keeps the chat
 * reachable and every check green.
 */

import ChatPanel from "@/components/ChatPanel";
import type { HighlightPayload } from "@/lib/assistant/events";

export default function ChatPage() {
  function handleTurnDone(payload: HighlightPayload) {
    // The map does not exist yet (Phase 3) — logging is the whole point here.
    console.log("[FiberDesk] map highlight", payload);
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 dark:bg-black">
      <main className="flex w-full max-w-2xl flex-1 flex-col">
        <ChatPanel onTurnDone={handleTurnDone} />
      </main>
    </div>
  );
}
