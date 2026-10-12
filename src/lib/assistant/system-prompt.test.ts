import { describe, expect, test } from "vitest";

import { SYSTEM_PROMPT } from "@/lib/assistant/system-prompt";
import { TRACE_TOOL_NAME } from "@/lib/assistant/tool-definitions";

describe("3.4 the system prompt covers the subscriber trace", () => {
  test("it names the trace tool and when to call it", () => {
    expect(SYSTEM_PROMPT).toContain(TRACE_TOOL_NAME);
    expect(SYSTEM_PROMPT).toContain("specific subscriber or customer");
  });

  test("it says a NAP status does not stand for its subscribers", () => {
    expect(SYSTEM_PROMPT).toContain("A NAP's status does not stand for its subscribers'");
  });

  test("it declines a subscriber the network lacks and an ONT verdict", () => {
    expect(SYSTEM_PROMPT).toContain("A subscriber identifier the network does not contain");
    expect(SYSTEM_PROMPT).toContain("whether a subscriber's ONT will work");
    expect(SYSTEM_PROMPT).toContain("receiver sensitivity");
  });
});
