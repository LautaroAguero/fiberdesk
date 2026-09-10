import { describe, expect, test } from "vitest";

import { runAssistantLoop } from "@/lib/assistant/loop";
import { buildToolDefinitions, DETAIL_TOOL_NAME, SUMMARIZE_TOOL_NAME } from "@/lib/assistant/tool-definitions";
import { loadNetwork } from "@/lib/network/load";
import { createFakeModelClient, makeFixtureMessage, textBlock, toolUseBlock } from "@/lib/assistant/test-fixtures";

const network = loadNetwork();
const tools = buildToolDefinitions(network);

function baseParams(client: ReturnType<typeof createFakeModelClient>["client"], userText: string) {
  return {
    client,
    model: "claude-opus-5",
    maxTokens: 4096,
    tools,
    network,
    messages: [{ role: "user" as const, content: userText }],
    onEvent: () => {},
  };
}

describe("4.1 the manual loop", () => {
  test("a turn with no tool use returns immediately with the final text", () => {
    const events: string[] = [];
    const { client } = createFakeModelClient([
      {
        textDeltas: ["Hello"],
        message: makeFixtureMessage({ content: [textBlock("Hello")], stop_reason: "end_turn" }),
      },
    ]);

    return runAssistantLoop({
      ...baseParams(client, "hi"),
      onEvent: (e) => events.push(e.type),
    }).then((result) => {
      expect(result.stopReason).toBe("end_turn");
      expect(result.toolCalls).toHaveLength(0);
      expect(events).toEqual(["text"]);
    });
  });

  test("two tool calls in one assistant turn both return in a SINGLE user message", async () => {
    const { client } = createFakeModelClient([
      {
        message: makeFixtureMessage({
          content: [
            toolUseBlock("toolu_1", DETAIL_TOOL_NAME, { nap_id: "NAP-09" }),
            toolUseBlock("toolu_2", DETAIL_TOOL_NAME, { nap_id: "NAP-12" }),
          ],
          stop_reason: "tool_use",
        }),
      },
      {
        message: makeFixtureMessage({ content: [textBlock("Both are problematic.")], stop_reason: "end_turn" }),
      },
    ]);

    const result = await runAssistantLoop(baseParams(client, "which fail?"));

    // messages: [user, assistant(tool_use x2), user(tool_result x2), assistant(text)]
    const toolResultMessage = result.messages[2];
    expect(toolResultMessage.role).toBe("user");
    expect(toolResultMessage.content).toHaveLength(2);
    expect(result.toolCalls).toHaveLength(2);
  });

  test("tool_start and tool_end events fire for each call, in order", async () => {
    const events: Array<{ type: string; name?: string }> = [];
    const { client } = createFakeModelClient([
      {
        message: makeFixtureMessage({
          content: [toolUseBlock("toolu_1", SUMMARIZE_TOOL_NAME, {})],
          stop_reason: "tool_use",
        }),
      },
      { message: makeFixtureMessage({ content: [textBlock("done")], stop_reason: "end_turn" }) },
    ]);

    await runAssistantLoop({
      ...baseParams(client, "which fail?"),
      onEvent: (e) => events.push(e.type === "tool_start" || e.type === "tool_end" ? { type: e.type, name: e.name } : { type: e.type }),
    });

    expect(events.filter((e) => e.type === "tool_start" || e.type === "tool_end")).toEqual([
      { type: "tool_start", name: SUMMARIZE_TOOL_NAME },
      { type: "tool_end", name: SUMMARIZE_TOOL_NAME },
    ]);
  });

  test("a tool call that errors is recorded but does not abort the loop", async () => {
    const { client } = createFakeModelClient([
      {
        message: makeFixtureMessage({
          content: [toolUseBlock("toolu_1", DETAIL_TOOL_NAME, { nap_id: "NAP-99" })],
          stop_reason: "tool_use",
        }),
      },
      { message: makeFixtureMessage({ content: [textBlock("no such NAP")], stop_reason: "end_turn" }) },
    ]);

    const result = await runAssistantLoop(baseParams(client, "detail NAP-99"));

    expect(result.toolCalls[0].isError).toBe(true);
    expect(result.stopReason).toBe("end_turn");
  });
});

describe("4.2 prior turns are replayed", () => {
  test("a follow-up request carries the previous turn's messages into the next request body", async () => {
    const priorAssistantMessage = { role: "assistant" as const, content: [textBlock("NAP-09 and NAP-12 fail or are marginal.")] };
    const { client, requests } = createFakeModelClient([
      { message: makeFixtureMessage({ content: [textBlock("NAP-12 is marginal because...")], stop_reason: "end_turn" }) },
    ]);

    await runAssistantLoop({
      ...baseParams(client, "why is the second one marginal?"),
      messages: [
        { role: "user", content: "which fail?" },
        priorAssistantMessage,
        { role: "user", content: "why is the second one marginal?" },
      ],
    });

    expect(requests[0].messages).toHaveLength(3);
    expect(requests[0].messages[1]).toEqual(priorAssistantMessage);
  });
});

describe("4.3 the iteration cap", () => {
  test("stops after maxIterations and reports why via an error event", async () => {
    const alwaysToolUse = () => ({
      message: makeFixtureMessage({
        content: [toolUseBlock("toolu_x", SUMMARIZE_TOOL_NAME, {})],
        stop_reason: "tool_use" as const,
      }),
    });
    const { client } = createFakeModelClient([alwaysToolUse(), alwaysToolUse(), alwaysToolUse()]);

    const events: string[] = [];
    const result = await runAssistantLoop({
      ...baseParams(client, "loop forever"),
      maxIterations: 3,
      onEvent: (e) => events.push(e.type),
    });

    expect(result.truncated).toBe(true);
    expect(result.stopReason).toBeNull();
    expect(events).toContain("error");
  });
});
