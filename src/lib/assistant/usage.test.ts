import { describe, expect, test } from "vitest";

import { runAssistantLoop } from "@/lib/assistant/loop";
import { createFakeModelClient, makeFixtureMessage, textBlock, toolUseBlock } from "@/lib/assistant/test-fixtures";
import { buildToolDefinitions, DETAIL_TOOL_NAME, SUMMARIZE_TOOL_NAME } from "@/lib/assistant/tool-definitions";
import { summarizeTurn, withUsageMetering, type ModelCallRecord } from "@/lib/assistant/usage";
import { buildSearchIndex } from "@/lib/corpus/search";
import { loadNetwork } from "@/lib/network/load";

const network = loadNetwork();
const tools = buildToolDefinitions(network);
const searchIndex = buildSearchIndex([]);

/** A clock that advances by `step` ms on every read. */
function steppingClock(step: number): () => number {
  let now = 0;
  return () => {
    const value = now;
    now += step;
    return value;
  };
}

function usage(input: number, output: number, cacheRead = 0) {
  return {
    cache_creation: null,
    cache_creation_input_tokens: null,
    cache_read_input_tokens: cacheRead,
    inference_geo: null,
    input_tokens: input,
    output_tokens: output,
    output_tokens_details: null,
    server_tool_use: null,
    service_tier: null,
  };
}

const surveyThenDetailThenAnswer = () => [
  {
    message: makeFixtureMessage({
      content: [toolUseBlock("toolu_1", SUMMARIZE_TOOL_NAME, {})],
      stop_reason: "tool_use",
      usage: usage(2000, 100),
    }),
  },
  {
    message: makeFixtureMessage({
      content: [
        toolUseBlock("toolu_2", DETAIL_TOOL_NAME, { nap_id: "NAP-09" }),
        toolUseBlock("toolu_3", DETAIL_TOOL_NAME, { nap_id: "NAP-12" }),
      ],
      stop_reason: "tool_use",
      usage: usage(2500, 150),
    }),
  },
  {
    message: makeFixtureMessage({
      content: [textBlock("NAP-09 fails; NAP-12 is marginal.")],
      stop_reason: "end_turn",
      usage: usage(3500, 250),
    }),
  },
];

async function runTurn(turns: Parameters<typeof createFakeModelClient>[0], calls: ModelCallRecord[]) {
  const { client } = createFakeModelClient(turns);
  return runAssistantLoop({
    client: withUsageMetering(client, (record) => calls.push(record), steppingClock(100)),
    model: "claude-opus-5",
    maxTokens: 4096,
    tools,
    network,
    searchIndex,
    messages: [{ role: "user", content: "which fail?" }],
    onEvent: () => {},
  });
}

describe("withUsageMetering", () => {
  test("records one entry per call with the served model, tokens, latency and cost", async () => {
    const calls: ModelCallRecord[] = [];
    await runTurn(surveyThenDetailThenAnswer(), calls);

    expect(calls).toHaveLength(3);
    expect(calls[0]).toEqual({
      model: "claude-opus-5",
      input_tokens: 2000,
      output_tokens: 100,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      latency_ms: 100,
      cost_usd: expect.closeTo(0.0125, 12), // 2000 × 5 / 1M + 100 × 25 / 1M
      stop_reason: "tool_use",
    });
  });

  test("a turn of three calls summarizes to 3 iterations, summed usage and the trajectory", async () => {
    const calls: ModelCallRecord[] = [];
    const result = await runTurn(surveyThenDetailThenAnswer(), calls);

    const summary = summarizeTurn(calls, result.toolCalls);

    expect(summary.iterations).toBe(3);
    expect(summary.input_tokens).toBe(8000);
    expect(summary.output_tokens).toBe(500);
    expect(summary.latency_ms).toBe(300);
    expect(summary.cost_usd).toBeCloseTo((8000 * 5 + 500 * 25) / 1_000_000, 12);
    expect(summary.unpriced_models).toEqual([]);
    expect(summary.trajectory).toEqual([
      { name: SUMMARIZE_TOOL_NAME, iteration: 1, is_error: false },
      { name: DETAIL_TOOL_NAME, iteration: 2, is_error: false },
      { name: DETAIL_TOOL_NAME, iteration: 2, is_error: false },
    ]);
  });

  test("when the second call throws, the first call's usage was already recorded", async () => {
    const calls: ModelCallRecord[] = [];
    // Only one fixture turn: the fake client throws on the second request.
    await expect(runTurn(surveyThenDetailThenAnswer().slice(0, 1), calls)).rejects.toThrow();

    expect(calls).toHaveLength(1);
    expect(calls[0].input_tokens).toBe(2000);
  });

  test("a call served by an unpriced model costs null, and so does its turn, naming the model", async () => {
    const calls: ModelCallRecord[] = [];
    const result = await runTurn(
      [
        {
          message: makeFixtureMessage({
            model: "claude-unpriced-test",
            content: [textBlock("hi")],
            stop_reason: "end_turn",
            usage: usage(10, 10),
          }),
        },
      ],
      calls,
    );

    expect(calls[0].cost_usd).toBeNull();
    expect(calls[0].input_tokens).toBe(10);
    const summary = summarizeTurn(calls, result.toolCalls);
    expect(summary.cost_usd).toBeNull();
    expect(summary.unpriced_models).toEqual(["claude-unpriced-test"]);
  });
});
