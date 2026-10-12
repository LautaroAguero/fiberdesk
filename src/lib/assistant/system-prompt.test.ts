import { describe, expect, test } from "vitest";

import { SYSTEM_PROMPT } from "@/lib/assistant/system-prompt";
import { CUT_IMPACT_TOOL_NAME, TRACE_TOOL_NAME } from "@/lib/assistant/tool-definitions";

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

describe("3.3 the system prompt covers the cut impact", () => {
  test("it names the cut impact tool, when to call it, and to quote its counts", () => {
    expect(SYSTEM_PROMPT).toContain(CUT_IMPACT_TOOL_NAME);
    expect(SYSTEM_PROMPT).toContain("what a cut, a break or an outage takes out of service");
    expect(SYSTEM_PROMPT).toContain("quote the figure from the result's counts");
    expect(SYSTEM_PROMPT).toContain("never count a list yourself");
  });

  test("it declines a cut at the OLT and an element the network lacks", () => {
    expect(SYSTEM_PROMPT).toContain("A cut at the OLT — say a cut at the OLT is not supported");
    expect(SYSTEM_PROMPT).toContain("do not state how many NAPs or subscribers it would affect");
    expect(SYSTEM_PROMPT).toContain("A fiber run or NAP identifier the network does not contain");
    expect(SYSTEM_PROMPT).toContain("with another element in its place");
  });
});
