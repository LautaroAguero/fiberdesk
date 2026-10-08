/**
 * Runs eval cases against a model client and assembles the run record.
 *
 * Everything that decides anything lives here, so it can be tested against
 * `createFakeModelClient` without the API: turn sequencing, grading, outcome
 * classification, the spend cap and the record. `evals/run.ts` only supplies
 * the real client and writes the file. See design.md (add-eval-harness),
 * decisions 1 and 9–11.
 *
 * Cases run one after another. Each user turn goes through the same
 * `runAssistantLoop` and `projectHighlight` the chat route uses, carrying the
 * conversation the previous turns really produced; only the last turn is
 * graded.
 */

import { createHash } from "node:crypto";

import type Anthropic from "@anthropic-ai/sdk";

import { projectHighlight } from "@/lib/assistant/highlight";
import { runAssistantLoop, type RunAssistantLoopParams, type ToolCallRecord } from "@/lib/assistant/loop";
import type { AssistantModelClient } from "@/lib/assistant/model-client";
import { withUsageMetering, type ModelCallRecord } from "@/lib/assistant/usage";
import type { SearchIndex } from "@/lib/corpus/search";
import type { Network } from "@/lib/network/types";
import { gradeAbstention } from "@/lib/evals/graders/abstention";
import { gradeCitation } from "@/lib/evals/graders/citation";
import { gradeFigures } from "@/lib/evals/graders/figures";
import { gradeGrounding } from "@/lib/evals/graders/grounding";
import { gradeHighlight, highlightIds } from "@/lib/evals/graders/highlight";
import type { GradedTurn } from "@/lib/evals/graders/input";
import { gradeTrajectory } from "@/lib/evals/graders/trajectory";
import { summarizeRun } from "@/lib/evals/stats";
import type {
  CaseRecord,
  GraderName,
  GraderResult,
  LoadedCase,
  RunRecord,
  RunStatus,
  TurnRecord,
} from "@/lib/evals/types";

export type Effort = NonNullable<RunAssistantLoopParams["effort"]>;

/** The request settings a run uses — the route's, unless overridden. */
export interface EvalConfig {
  model: string;
  effort: Effort;
  maxTokens: number;
  /** Recorded in the prompt hash; the loop itself sets it on every request. */
  thinking: unknown;
  system: string;
  tools: Anthropic.Tool[];
  overridden: { model: boolean; effort: boolean };
}

export interface RunEvalSuiteParams {
  cases: LoadedCase[];
  client: AssistantModelClient;
  network: Network;
  searchIndex: SearchIndex;
  config: EvalConfig;
  /** US dollars. Required and positive. */
  maxUsd: number;
  gitCommit?: string | null;
  now?: () => Date;
  /** Milliseconds; injectable so tests can fix latencies. */
  clock?: () => number;
  onProgress?: (progress: { index: number; total: number; record: CaseRecord; spentUsd: number }) => void;
}

/** Sorts object keys recursively, so the hash does not depend on key order. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/**
 * SHA-256 over the system prompt, the tool definitions and the request
 * settings other than the model, which is recorded beside it.
 */
export function promptHash(system: string, tools: Anthropic.Tool[], settings: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical({ system, tools, settings })))
    .digest("hex");
}

/** Sum of known costs, and whether any call was unpriced. */
function costOf(calls: ModelCallRecord[]): { known: number; total: number | null } {
  const known = calls.reduce((sum, call) => sum + (call.cost_usd ?? 0), 0);
  return { known, total: calls.some((call) => call.cost_usd === null) ? null : known };
}

/** The text and native citations of the assistant messages a turn appended. */
function readAnswer(appended: Anthropic.MessageParam[]): { answer: string; citedSources: string[] } {
  const texts: string[] = [];
  const cited = new Set<string>();
  for (const message of appended) {
    if (message.role !== "assistant" || typeof message.content === "string") continue;
    for (const block of message.content) {
      if (block.type !== "text") continue;
      texts.push(block.text);
      for (const citation of (block as Anthropic.TextBlock).citations ?? []) {
        const name =
          "source" in citation && citation.source
            ? citation.source
            : "title" in citation && citation.title
              ? citation.title
              : "document_title" in citation
                ? citation.document_title
                : null;
        if (name) cited.add(name);
      }
    }
  }
  return { answer: texts.join("\n"), citedSources: [...cited] };
}

function grade(evalCase: LoadedCase, turn: GradedTurn) {
  const graders: Partial<Record<GraderName, GraderResult>> = {};
  const { expect } = evalCase;
  let signOnly: number[] = [];

  if (expect.trajectory) graders.trajectory = gradeTrajectory(turn, expect.trajectory);
  if (expect.highlight) graders.highlight = gradeHighlight(turn, expect.highlight);
  if (expect.grounding || expect.abstention) {
    const { sign_only, ...result } = gradeGrounding(turn);
    signOnly = sign_only;
    if (expect.grounding) graders.grounding = result;
  }
  if (expect.abstention) graders.abstention = gradeAbstention(turn);
  if (expect.figures) graders.figures = gradeFigures(turn, expect.figures);
  if (expect.citation) graders.citation = gradeCitation(turn);

  return { graders, signOnly };
}

/** Runs one case's turns live, then grades the last. Never throws: a failure becomes `error`. */
async function runCase(
  evalCase: LoadedCase,
  params: RunEvalSuiteParams,
): Promise<{ record: CaseRecord; calls: ModelCallRecord[] }> {
  const { config, network, searchIndex } = params;
  const allCalls: ModelCallRecord[] = [];
  let turnCalls: ModelCallRecord[] = [];
  const client = withUsageMetering(
    params.client,
    (record) => {
      allCalls.push(record);
      turnCalls.push(record);
    },
    params.clock,
  );

  let messages: Anthropic.MessageParam[] = [];
  const priorToolCalls: ToolCallRecord[] = [];
  const userMessages: string[] = [];
  const turns: TurnRecord[] = [];
  let lastGraded: GradedTurn | null = null;

  const base = { id: evalCase.id, area: evalCase.area, graders: {}, sign_only: [] as number[] };

  try {
    for (const userText of evalCase.turns) {
      turnCalls = [];
      userMessages.push(userText);
      const before = messages.length + 1;
      const result = await runAssistantLoop({
        client,
        model: config.model,
        maxTokens: config.maxTokens,
        system: config.system,
        tools: config.tools,
        network,
        searchIndex,
        messages: [...messages, { role: "user", content: userText }],
        effort: config.effort,
        onEvent: () => {},
      });
      messages = result.messages;

      const { answer, citedSources } = readAnswer(result.messages.slice(before));
      const payload = projectHighlight(result.toolCalls);
      turns.push({
        user: userText,
        answer,
        cited_sources: citedSources,
        stop_reason: result.stopReason,
        trajectory: result.toolCalls.map((call) => ({
          name: call.name,
          input: call.input,
          iteration: call.iteration,
          is_error: call.isError,
        })),
        highlight_ids: highlightIds(payload),
        calls: turnCalls,
        cost_usd: costOf(turnCalls).total,
        latency_ms: turnCalls.reduce((sum, call) => sum + call.latency_ms, 0),
      });

      if (result.truncated) {
        throw new Error("the loop hit its iteration cap without finishing the turn");
      }

      lastGraded = {
        answer,
        citedSources,
        toolCalls: result.toolCalls,
        priorToolCalls: [...priorToolCalls],
        userMessages: [...userMessages],
        payload,
      };
      priorToolCalls.push(...result.toolCalls);
    }
  } catch (error) {
    return {
      record: {
        ...base,
        outcome: "error",
        error: error instanceof Error ? error.message : String(error),
        turns,
        cost_usd: costOf(allCalls).total,
      },
      calls: allCalls,
    };
  }

  const { graders, signOnly } = grade(evalCase, lastGraded!);
  const pass = Object.values(graders).every((result) => result.pass);
  return {
    record: { ...base, outcome: pass ? "pass" : "fail", graders, sign_only: signOnly, turns, cost_usd: costOf(allCalls).total },
    calls: allCalls,
  };
}

/**
 * Runs `cases` in order under a spend cap and returns the run record.
 *
 * Before each case the run stops if what is spent plus the most expensive
 * case so far would exceed `maxUsd`; the remaining cases are recorded as
 * `skipped_budget`. A case in progress is never interrupted. A call served by
 * a model the pricing table does not list ends the run after its case: the
 * cap can no longer be enforced.
 */
export async function runEvalSuite(params: RunEvalSuiteParams): Promise<RunRecord> {
  const { cases, config, maxUsd } = params;
  if (!(typeof maxUsd === "number" && Number.isFinite(maxUsd) && maxUsd > 0)) {
    throw new Error("A spend cap is required: pass --max-usd with a positive amount in US dollars.");
  }
  const now = params.now ?? (() => new Date());
  const startedAt = now().toISOString();

  const records: CaseRecord[] = [];
  const unpricedModels = new Set<string>();
  let spent = 0;
  let maxCaseCost = 0;
  let stoppedReason: string | null = null;

  for (const [index, evalCase] of cases.entries()) {
    if (stoppedReason === null && spent + maxCaseCost > maxUsd) {
      stoppedReason =
        `spend cap: $${spent.toFixed(4)} spent + $${maxCaseCost.toFixed(4)} (most expensive case so far) ` +
        `would exceed the $${maxUsd} cap`;
    }
    if (stoppedReason !== null) {
      records.push({
        id: evalCase.id,
        area: evalCase.area,
        outcome: "skipped_budget",
        graders: {},
        sign_only: [],
        turns: [],
        cost_usd: null,
      });
      continue;
    }

    const { record, calls } = await runCase(evalCase, params);
    records.push(record);
    const { known, total } = costOf(calls);
    spent += known;
    maxCaseCost = Math.max(maxCaseCost, known);

    if (total === null) {
      for (const call of calls) if (call.cost_usd === null) unpricedModels.add(call.model);
      stoppedReason = `unpriced model: ${[...unpricedModels].join(", ")} — the spend cap can no longer be enforced`;
    }
    params.onProgress?.({ index, total: cases.length, record, spentUsd: spent });
  }

  const status: RunStatus =
    stoppedReason !== null ? "partial" : records.some((r) => r.outcome === "error") ? "incomplete" : "complete";

  return {
    schema_version: 1,
    started_at: startedAt,
    finished_at: now().toISOString(),
    git_commit: params.gitCommit ?? null,
    model: config.model,
    effort: config.effort,
    overridden: config.overridden,
    prompt_hash: promptHash(config.system, config.tools, {
      max_tokens: config.maxTokens,
      thinking: config.thinking,
      effort: config.effort,
    }),
    max_usd: maxUsd,
    spent_usd: spent,
    status,
    stopped_reason: stoppedReason,
    unpriced_models: [...unpricedModels],
    summary: summarizeRun(records),
    cases: records,
  };
}
