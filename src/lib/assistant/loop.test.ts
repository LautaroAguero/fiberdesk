import { describe, expect, test } from "vitest";

import type Anthropic from "@anthropic-ai/sdk";

import { THINKING } from "@/lib/assistant/config";
import { runAssistantLoop } from "@/lib/assistant/loop";
import { buildToolDefinitions, DETAIL_TOOL_NAME, SUMMARIZE_TOOL_NAME } from "@/lib/assistant/tool-definitions";
import { buildSearchIndex } from "@/lib/corpus/search";
import { loadNetwork } from "@/lib/network/load";
import { SYSTEM_PROMPT } from "@/lib/assistant/system-prompt";
import { createFakeModelClient, makeFixtureMessage, textBlock, toolUseBlock } from "@/lib/assistant/test-fixtures";

const network = loadNetwork();
const tools = buildToolDefinitions(network);
const searchIndex = buildSearchIndex([]); // empty: this file never exercises documentation search

function baseParams(client: ReturnType<typeof createFakeModelClient>["client"], userText: string) {
  return {
    client,
    model: "claude-opus-5",
    maxTokens: 4096,
    tools,
    network,
    searchIndex,
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

describe("the request settings", () => {
  test("every request carries the shared thinking setting from config", async () => {
    const { client, requests } = createFakeModelClient([
      { message: makeFixtureMessage({ content: [textBlock("hi")], stop_reason: "end_turn" }) },
    ]);

    await runAssistantLoop(baseParams(client, "hi"));

    expect(requests[0].thinking).toEqual(THINKING);
    expect(requests[0].thinking).toEqual({ type: "adaptive", display: "summarized" });
  });
});

describe("tool calls record their iteration", () => {
  test("a survey turn then a two-detail parallel turn yields iterations 1, 2, 2", async () => {
    const { client } = createFakeModelClient([
      {
        message: makeFixtureMessage({
          content: [toolUseBlock("toolu_1", SUMMARIZE_TOOL_NAME, {})],
          stop_reason: "tool_use",
        }),
      },
      {
        message: makeFixtureMessage({
          content: [
            toolUseBlock("toolu_2", DETAIL_TOOL_NAME, { nap_id: "NAP-09" }),
            toolUseBlock("toolu_3", DETAIL_TOOL_NAME, { nap_id: "NAP-12" }),
          ],
          stop_reason: "tool_use",
        }),
      },
      { message: makeFixtureMessage({ content: [textBlock("done")], stop_reason: "end_turn" }) },
    ]);

    const result = await runAssistantLoop(baseParams(client, "which fail?"));

    expect(result.toolCalls.map((call) => [call.name, call.iteration])).toEqual([
      [SUMMARIZE_TOOL_NAME, 1],
      [DETAIL_TOOL_NAME, 2],
      [DETAIL_TOOL_NAME, 2],
    ]);
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

describe("prompt caching (reduce-cost-per-question, task 2.2)", () => {
  /** A survey, then an answer: two requests, so the second carries a grown `messages`. */
  function surveyThenAnswer() {
    return createFakeModelClient([
      {
        message: makeFixtureMessage({
          content: [toolUseBlock("toolu_1", SUMMARIZE_TOOL_NAME, {})],
          stop_reason: "tool_use",
        }),
      },
      { message: makeFixtureMessage({ content: [textBlock("NAP-09 fails.")], stop_reason: "end_turn" }) },
    ]);
  }

  async function requestsFor(promptCaching: boolean | undefined) {
    const { client, requests } = surveyThenAnswer();
    await runAssistantLoop({
      ...baseParams(client, "which fail?"),
      system: SYSTEM_PROMPT,
      effort: "low",
      ...(promptCaching === undefined ? {} : { promptCaching }),
    });
    return requests;
  }

  /** The request with every cache marker removed: what the model reads. */
  function stripMarkers(request: Anthropic.MessageStreamParams) {
    const rest: Partial<Anthropic.MessageStreamParams> = { ...request };
    delete rest.cache_control;
    const { system } = request;
    const text = Array.isArray(system) ? system.map((block) => block.text).join("") : system;
    return { ...rest, system: text };
  }

  test("(a) with caching on, every request marks the end of the system prompt and the tail", async () => {
    const requests = await requestsFor(true);

    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.system).toEqual([
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ]);
      expect(request.cache_control).toEqual({ type: "ephemeral" });
    }
  });

  test("(b) with caching off, the request is byte-identical to the uncached one", async () => {
    const off = await requestsFor(false);
    const omitted = await requestsFor(undefined);

    const expectedFirst = {
      model: "claude-opus-5",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools,
      messages: [{ role: "user", content: "which fail?" }],
      thinking: THINKING,
      output_config: { effort: "low" },
    };
    expect(JSON.stringify(off[0])).toBe(JSON.stringify(expectedFirst));
    expect(JSON.stringify(off)).toBe(JSON.stringify(omitted));
    for (const request of off) {
      expect(request).not.toHaveProperty("cache_control");
      expect(typeof request.system).toBe("string");
    }
  });

  test("(c) with markers stripped, cached and uncached requests are deep-equal", async () => {
    const cached = await requestsFor(true);
    const uncached = await requestsFor(false);

    expect(cached.map(stripMarkers)).toEqual(uncached.map(stripMarkers));
    expect(cached.map(stripMarkers)).toEqual(uncached);
  });

  test("(d) no marker goes inside messages, and the messages passed in are not mutated", async () => {
    const { client, requests } = surveyThenAnswer();
    const input: Anthropic.MessageParam[] = [{ role: "user", content: "which fail?" }];
    const snapshot = structuredClone(input);

    await runAssistantLoop({ ...baseParams(client, "which fail?"), messages: input, promptCaching: true });

    expect(input).toEqual(snapshot);
    expect(input).toHaveLength(1);
    expect(JSON.stringify(requests.map((request) => request.messages))).not.toContain("cache_control");
  });
});
