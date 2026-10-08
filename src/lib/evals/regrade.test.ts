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
import { regradeRecord } from "@/lib/evals/regrade";
import { runEvalSuite } from "@/lib/evals/runner";
import type { LoadedCase, RunRecord } from "@/lib/evals/types";

const config = {
  model: MODEL,
  effort: EFFORT,
  maxTokens: MAX_TOKENS,
  thinking: THINKING,
  system: SYSTEM_PROMPT,
  tools: buildToolDefinitions(network),
  overridden: { model: false, effort: false },
};

const reply = (content: FixtureTurn["message"]["content"], stop: "tool_use" | "end_turn"): FixtureTurn => ({
  message: makeFixtureMessage({ content, stop_reason: stop }),
});

const failingCase: LoadedCase = {
  id: "budget-failing-en",
  area: "budget",
  source: "test",
  file: "budget.json",
  turns: ["which NAPs fail the optical budget?"],
  expect: {
    trajectory: { required: [SUMMARIZE_TOOL_NAME, DETAIL_TOOL_NAME], order: [[SUMMARIZE_TOOL_NAME, DETAIL_TOOL_NAME]] },
    highlight: { mode: "equals", ids: ["NAP-09", "NAP-12"] },
    grounding: true,
  },
};

const followUpCase: LoadedCase = {
  id: "conv-and-nap12-es",
  area: "conversation",
  source: "test",
  file: "conversation.json",
  turns: ["¿qué cajas no cierran el presupuesto óptico?", "¿y la NAP-12?"],
  expect: { grounding: true, figures: [2.77] },
};

const skippedCase: LoadedCase = { ...followUpCase, id: "never-ran" };

const surveyThenDetail = (text: string): FixtureTurn[] => [
  reply([toolUseBlock("t1", SUMMARIZE_TOOL_NAME, {})], "tool_use"),
  reply(
    [toolUseBlock("t2", DETAIL_TOOL_NAME, { nap_id: "NAP-09" }), toolUseBlock("t3", DETAIL_TOOL_NAME, { nap_id: "NAP-12" })],
    "tool_use",
  ),
  reply([textBlock(text)], "end_turn"),
];

/** A recorded run, made with the fake client and round-tripped through JSON as a committed file would be. */
async function recordedRun(): Promise<RunRecord> {
  const { client } = createFakeModelClient([
    ...surveyThenDetail("NAP-09 fails at −1.40 dB; NAP-12 is marginal at 2.77 dB."),
    ...surveyThenDetail("Dos cajas no cierran."),
    reply([textBlock("NAP-12 tiene un margen de 2,77 dB.")], "end_turn"),
  ]);
  // A tiny cap: both cases run (the first always does), then the third is skipped.
  const record = await runEvalSuite({
    cases: [failingCase, followUpCase, skippedCase],
    client,
    network,
    searchIndex,
    config,
    maxUsd: 0.0001,
  });
  return JSON.parse(JSON.stringify(record)) as RunRecord;
}

describe("regradeRecord", () => {
  test("a JSON round trip re-grades to the same outcomes, with no client involved", async () => {
    const original = await recordedRun();
    expect(original.cases.map((c) => c.outcome)).toEqual(["pass", "skipped_budget", "skipped_budget"]);

    const { record, issues } = regradeRecord(original, [failingCase, followUpCase, skippedCase], network, searchIndex);

    expect(issues).toEqual([]);
    expect(record.cases.map((c) => c.outcome)).toEqual(original.cases.map((c) => c.outcome));
    expect(record.cases[0].graders).toEqual(original.cases[0].graders);
    expect(record.regraded_at).toBeDefined();
  });

  test("a follow-up re-grades against the earlier turn's rebuilt tool results", async () => {
    const { client } = createFakeModelClient([
      ...surveyThenDetail("Dos cajas no cierran."),
      reply([textBlock("NAP-12 tiene un margen de 2,77 dB.")], "end_turn"),
    ]);
    const original = JSON.parse(
      JSON.stringify(await runEvalSuite({ cases: [followUpCase], client, network, searchIndex, config, maxUsd: 5 })),
    ) as RunRecord;
    expect(original.cases[0].outcome).toBe("pass");

    const { record, issues } = regradeRecord(original, [followUpCase], network, searchIndex);
    expect(issues).toEqual([]);
    expect(record.cases[0].outcome).toBe("pass");
  });

  test("adding required figure 99 turns a pass into a fail", async () => {
    const original = await recordedRun();
    const tightened = { ...failingCase, expect: { ...failingCase.expect, figures: [99] } };

    const { record } = regradeRecord(original, [tightened, followUpCase, skippedCase], network, searchIndex);

    expect(record.cases[0].outcome).toBe("fail");
    expect(record.cases[0].graders.figures).toEqual({ pass: false, reasons: ["required figure 99 not stated"] });
    expect(record.summary.overall).toMatchObject({ passes: 0, completed: 1 });
  });

  test("a tampered hash leaves the case as recorded and names the case and tool", async () => {
    const original = await recordedRun();
    original.cases[0].turns[0].trajectory[1].result_sha256 = "0".repeat(64);
    const tightened = { ...failingCase, expect: { ...failingCase.expect, figures: [99] } };

    const { record, issues } = regradeRecord(original, [tightened, followUpCase, skippedCase], network, searchIndex);

    expect(record.cases[0]).toEqual(original.cases[0]);
    expect(issues).toHaveLength(1);
    expect(issues[0].case).toBe("budget-failing-en");
    expect(issues[0].message).toContain("detail_optical_budget");
  });

  test("error and skipped cases pass through unchanged", async () => {
    const original = await recordedRun();
    original.cases[0] = { ...original.cases[0], outcome: "error", error: "boom" };

    const { record } = regradeRecord(original, [failingCase, followUpCase, skippedCase], network, searchIndex);

    expect(record.cases[0]).toEqual(original.cases[0]);
    expect(record.cases[2]).toEqual(original.cases[2]);
  });

  test("a case no longer on disk is reported, not dropped", async () => {
    const original = await recordedRun();
    const { record, issues } = regradeRecord(original, [], network, searchIndex);

    expect(record.cases).toHaveLength(3);
    expect(issues).toEqual([{ case: "budget-failing-en", message: "no longer defined in evals/cases/; kept as recorded" }]);
  });

  test("a case whose turns changed is not re-graded", async () => {
    const original = await recordedRun();
    const reworded = { ...failingCase, turns: ["which boxes fail?"] };
    const { issues } = regradeRecord(original, [reworded], network, searchIndex);
    expect(issues[0].message).toContain("turns changed");
  });
});
