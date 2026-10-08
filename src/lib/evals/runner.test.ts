import { describe, expect, test } from "vitest";

import { EFFORT, MAX_TOKENS, MODEL, THINKING } from "@/lib/assistant/config";
import { SYSTEM_PROMPT } from "@/lib/assistant/system-prompt";
import {
  createFakeModelClient,
  makeFixtureMessage,
  textBlock,
  toolUseBlock,
  type FixtureTurn,
} from "@/lib/assistant/test-fixtures";
import { buildToolDefinitions, DETAIL_TOOL_NAME, SUMMARIZE_TOOL_NAME } from "@/lib/assistant/tool-definitions";
import { network, searchIndex } from "@/lib/evals/graders/test-helpers";
import { promptHash, runEvalSuite, type EvalConfig } from "@/lib/evals/runner";
import type { LoadedCase } from "@/lib/evals/types";

const tools = buildToolDefinitions(network);
const config: EvalConfig = {
  model: MODEL,
  effort: EFFORT,
  maxTokens: MAX_TOKENS,
  thinking: THINKING,
  system: SYSTEM_PROMPT,
  tools,
  overridden: { model: false, effort: false },
};

function usage(input: number, output = 0) {
  return {
    cache_creation: null,
    cache_creation_input_tokens: null,
    cache_read_input_tokens: null,
    inference_geo: null,
    input_tokens: input,
    output_tokens: output,
    output_tokens_details: null,
    server_tool_use: null,
    service_tier: null,
  };
}

const answer = (text: string, input = 1000, model = "claude-opus-5"): FixtureTurn => ({
  message: makeFixtureMessage({ model, content: [textBlock(text)], stop_reason: "end_turn", usage: usage(input) }),
});
const toolTurn = (blocks: ReturnType<typeof toolUseBlock>[]): FixtureTurn => ({
  message: makeFixtureMessage({ content: blocks, stop_reason: "tool_use", usage: usage(1000) }),
});

const failingCase: LoadedCase = {
  id: "budget-failing-en",
  area: "budget",
  source: "test",
  file: "budget.json",
  turns: ["which NAPs fail the optical budget?"],
  expect: {
    trajectory: {
      required: [SUMMARIZE_TOOL_NAME, DETAIL_TOOL_NAME],
      order: [[SUMMARIZE_TOOL_NAME, DETAIL_TOOL_NAME]],
    },
    highlight: { mode: "equals", ids: ["NAP-09", "NAP-12"] },
    grounding: true,
  },
};

const surveyThenDetail = (finalText: string): FixtureTurn[] => [
  toolTurn([toolUseBlock("t1", SUMMARIZE_TOOL_NAME, {})]),
  toolTurn([
    toolUseBlock("t2", DETAIL_TOOL_NAME, { nap_id: "NAP-09" }),
    toolUseBlock("t3", DETAIL_TOOL_NAME, { nap_id: "NAP-12" }),
  ]),
  answer(finalText),
];

function simpleCase(id: string, overrides: Partial<LoadedCase> = {}): LoadedCase {
  return {
    id,
    area: "abstention",
    source: "test",
    file: "abstention.json",
    turns: ["What is the ONT receiver sensitivity?"],
    expect: { abstention: true },
    ...overrides,
  };
}

describe("6.1 running cases", () => {
  test("the reference question passes every grader and is recorded in full", async () => {
    const { client } = createFakeModelClient(surveyThenDetail("NAP-09 fails at −1.40 dB; NAP-12 is marginal at 2.77 dB."));
    const record = await runEvalSuite({ cases: [failingCase], client, network, searchIndex, config, maxUsd: 5 });

    const [result] = record.cases;
    expect(result.outcome).toBe("pass");
    expect(Object.keys(result.graders).sort()).toEqual(["grounding", "highlight", "trajectory"]);
    expect(result.turns[0].answer).toBe("NAP-09 fails at −1.40 dB; NAP-12 is marginal at 2.77 dB.");
    expect(result.turns[0].highlight_ids).toEqual(["NAP-09", "NAP-12"]);
    expect(result.turns[0].trajectory.map((step) => [step.name, step.iteration])).toEqual([
      [SUMMARIZE_TOOL_NAME, 1],
      [DETAIL_TOOL_NAME, 2],
      [DETAIL_TOOL_NAME, 2],
    ]);
    expect(result.turns[0].calls).toHaveLength(3);
    expect(result.cost_usd).toBeCloseTo((3000 * 5) / 1_000_000, 12);
    expect(record.status).toBe("complete");
  });

  test("one failing grader fails the case, keeping every grader's result", async () => {
    const { client } = createFakeModelClient(surveyThenDetail("NAP-12 is marginal at about 2.7 dB."));
    const record = await runEvalSuite({ cases: [failingCase], client, network, searchIndex, config, maxUsd: 5 });

    const [result] = record.cases;
    expect(result.outcome).toBe("fail");
    expect(result.graders.trajectory?.pass).toBe(true);
    expect(result.graders.highlight?.pass).toBe(true);
    expect(result.graders.grounding).toEqual({ pass: false, reasons: ["ungrounded figure 2.7"] });
  });

  test("a two-turn case carries the first turn's tool blocks forward and grades only the second answer", async () => {
    const twoTurn: LoadedCase = {
      id: "conv-and-nap12-es",
      area: "conversation",
      source: "test",
      file: "conversation.json",
      turns: ["¿qué cajas no cierran el presupuesto óptico?", "¿y la NAP-12?"],
      expect: { grounding: true, figures: [2.77] },
    };
    const { client, requests } = createFakeModelClient([
      // The first answer states an ungrounded 99 — it must not be graded.
      ...surveyThenDetail("Dos cajas: 99 problemas."),
      answer("NAP-12 tiene un margen de 2,77 dB."),
    ]);
    const record = await runEvalSuite({ cases: [twoTurn], client, network, searchIndex, config, maxUsd: 5 });

    const secondRequest = requests[3];
    const blockTypes = secondRequest.messages.flatMap((message) =>
      typeof message.content === "string" ? ["text"] : message.content.map((block) => block.type),
    );
    expect(blockTypes.filter((type) => type === "tool_use")).toHaveLength(3);
    expect(blockTypes.filter((type) => type === "tool_result")).toHaveLength(3);
    expect(secondRequest.messages.at(-1)).toEqual({ role: "user", content: "¿y la NAP-12?" });

    const [result] = record.cases;
    expect(result.outcome).toBe("pass");
    expect(result.turns).toHaveLength(2);
    expect(result.turns[1].answer).toBe("NAP-12 tiene un margen de 2,77 dB.");
  });

  test("a client error is recorded as error and the run as incomplete", async () => {
    const { client } = createFakeModelClient([]); // no fixture turn: the first request throws
    const record = await runEvalSuite({ cases: [simpleCase("abstain-ont-en")], client, network, searchIndex, config, maxUsd: 5 });

    expect(record.cases[0].outcome).toBe("error");
    expect(record.cases[0].error).toContain("no fixture turn left");
    expect(record.status).toBe("incomplete");
    expect(record.summary.overall).toMatchObject({ completed: 0, errors: 1 });
  });

  test("a loop that hits its iteration cap is an error, not a fail", async () => {
    const forever = Array.from({ length: 8 }, (_, i) => toolTurn([toolUseBlock(`t${i}`, SUMMARIZE_TOOL_NAME, {})]));
    const { client } = createFakeModelClient(forever);
    const record = await runEvalSuite({ cases: [simpleCase("loops")], client, network, searchIndex, config, maxUsd: 5 });

    expect(record.cases[0].outcome).toBe("error");
    expect(record.cases[0].error).toContain("iteration cap");
  });

  test("a refusal is graded like any other answer, not treated as an error", async () => {
    const { client } = createFakeModelClient([
      { message: makeFixtureMessage({ content: [textBlock("I can't help with that.")], stop_reason: "refusal", usage: usage(100) }) },
    ]);
    const record = await runEvalSuite({ cases: [simpleCase("abstain-ont-en")], client, network, searchIndex, config, maxUsd: 5 });

    expect(record.cases[0].outcome).toBe("pass");
    expect(record.cases[0].turns[0].stop_reason).toBe("refusal");
  });
});

describe("6.2 the spend cap and the record", () => {
  test("cap $1.00, $0.90 spent, most expensive case $0.15: the rest are skipped and the run is partial", async () => {
    // 30,000 input tokens on Opus 5 at $5/MTok = $0.15 per case.
    const cases = Array.from({ length: 8 }, (_, i) => simpleCase(`case-${i}`));
    const { client, requests } = createFakeModelClient(cases.map(() => answer("Not available.", 30_000)));

    const record = await runEvalSuite({ cases, client, network, searchIndex, config, maxUsd: 1 });

    expect(requests).toHaveLength(6);
    expect(record.spent_usd).toBeCloseTo(0.9, 12);
    expect(record.cases.map((c) => c.outcome)).toEqual([
      ...Array(6).fill("pass"),
      "skipped_budget",
      "skipped_budget",
    ]);
    expect(record.status).toBe("partial");
    expect(record.stopped_reason).toContain("spend cap");
    expect(record.summary.overall).toMatchObject({ completed: 6, skipped: 2 });
  });

  test("an unpriced model stops the run after its case, naming the model", async () => {
    const cases = [simpleCase("a"), simpleCase("b")];
    const { client, requests } = createFakeModelClient([
      answer("Not available.", 100, "claude-unpriced-test"),
      answer("Not available."),
    ]);

    const record = await runEvalSuite({ cases, client, network, searchIndex, config, maxUsd: 5 });

    expect(requests).toHaveLength(1);
    expect(record.cases.map((c) => c.outcome)).toEqual(["pass", "skipped_budget"]);
    expect(record.unpriced_models).toEqual(["claude-unpriced-test"]);
    expect(record.stopped_reason).toContain("claude-unpriced-test");
    expect(record.status).toBe("partial");
  });

  test.each([undefined, 0, -1, Number.NaN])("a cap of %s is refused before any call", async (maxUsd) => {
    const { client, requests } = createFakeModelClient([answer("x")]);
    await expect(
      runEvalSuite({ cases: [simpleCase("a")], client, network, searchIndex, config, maxUsd: maxUsd as number }),
    ).rejects.toThrow(/spend cap is required/);
    expect(requests).toHaveLength(0);
  });

  test("one character of the system prompt changes the hash; key order in the settings does not", () => {
    const base = promptHash(SYSTEM_PROMPT, tools, { max_tokens: 4096, effort: "low", thinking: THINKING });
    expect(promptHash(SYSTEM_PROMPT + " ", tools, { max_tokens: 4096, effort: "low", thinking: THINKING })).not.toBe(base);
    expect(promptHash(SYSTEM_PROMPT, tools, { thinking: THINKING, effort: "low", max_tokens: 4096 })).toBe(base);
  });

  test("the record carries the configuration and a summary computed from the cases", async () => {
    const { client } = createFakeModelClient(surveyThenDetail("NAP-09 fails at −1.40 dB; NAP-12 is marginal at 2.77 dB."));
    const times = ["2026-10-08T10:00:00.000Z", "2026-10-08T10:05:00.000Z"];
    const record = await runEvalSuite({
      cases: [failingCase],
      client,
      network,
      searchIndex,
      config,
      maxUsd: 5,
      gitCommit: "abc123",
      now: () => new Date(times.shift()!),
    });

    expect(record).toMatchObject({
      schema_version: 1,
      started_at: "2026-10-08T10:00:00.000Z",
      finished_at: "2026-10-08T10:05:00.000Z",
      git_commit: "abc123",
      model: "claude-opus-5",
      effort: "low",
      max_usd: 5,
      status: "complete",
      stopped_reason: null,
    });
    expect(record.prompt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(record.summary.overall).toMatchObject({ passes: 1, completed: 1 });
    expect(record.summary.cost_per_question.n).toBe(1);
  });
});
