/**
 * Re-grades a committed run record without calling the model.
 *
 * A record keeps each turn's answer and the tool calls the model made, with
 * a hash of every result. The tools are deterministic, so re-dispatching
 * those calls against the seed and corpus rebuilds exactly what the model
 * saw — and the hash proves it. The graders then run again with the cases'
 * current expectations. Fixing a grader or tightening a case never needs a
 * new live run. See design.md (add-eval-harness), decision 15.
 */

import { dispatchTool } from "@/lib/assistant/dispatcher";
import { projectHighlight } from "@/lib/assistant/highlight";
import type { ToolCallRecord } from "@/lib/assistant/loop";
import type { SearchIndex } from "@/lib/corpus/search";
import type { Network } from "@/lib/network/types";
import { gradeCase } from "@/lib/evals/grade";
import type { GradedTurn } from "@/lib/evals/graders/input";
import { sha256Json } from "@/lib/evals/hash";
import { summarizeRun } from "@/lib/evals/stats";
import type { CaseRecord, LoadedCase, RecordedToolCall, RunRecord } from "@/lib/evals/types";

export interface RegradeIssue {
  case: string;
  message: string;
}

export interface RegradeResult {
  /** The re-graded record. Cases that could not be re-graded keep their original grading. */
  record: RunRecord;
  /** Every case that could not be re-graded, and why. */
  issues: RegradeIssue[];
}

class RebuildError extends Error {}

/** Re-dispatches one recorded step, refusing a result that differs from what the model saw. */
function rebuild(step: RecordedToolCall, network: Network, searchIndex: SearchIndex): ToolCallRecord {
  const { content, isError } = dispatchTool(step.name, step.input, network, searchIndex);
  const result = isError ? null : typeof content === "string" ? JSON.parse(content) : content;
  const hash = isError ? null : sha256Json(result);
  if (isError !== step.is_error || hash !== step.result_sha256) {
    throw new RebuildError(
      `${step.name} ${JSON.stringify(step.input)} no longer returns what the model saw ` +
        "(the seed, corpus or engine changed since the run)",
    );
  }
  return { name: step.name, input: step.input, result, isError, iteration: step.iteration };
}

function regradeCase(
  caseRecord: CaseRecord,
  evalCase: LoadedCase,
  network: Network,
  searchIndex: SearchIndex,
): CaseRecord {
  const { turns } = caseRecord;
  if (turns.length !== evalCase.turns.length || turns.some((turn, i) => turn.user !== evalCase.turns[i])) {
    throw new RebuildError("the case's turns changed since the run; its answers no longer answer them");
  }

  const toolCallsByTurn = turns.map((turn) => turn.trajectory.map((step) => rebuild(step, network, searchIndex)));
  const last = turns.length - 1;
  const toolCalls = toolCallsByTurn[last];
  const graded: GradedTurn = {
    answer: turns[last].answer,
    citedSources: turns[last].cited_sources,
    toolCalls,
    priorToolCalls: toolCallsByTurn.slice(0, last).flat(),
    userMessages: turns.map((turn) => turn.user),
    payload: projectHighlight(toolCalls),
  };

  const { graders, signOnly, pass } = gradeCase(evalCase.expect, graded);
  return { ...caseRecord, outcome: pass ? "pass" : "fail", graders, sign_only: signOnly };
}

/**
 * Re-applies the graders to every completed case of `record`, using the
 * expectations in `cases`. `error` and `skipped_budget` cases have no answer
 * to grade and pass through unchanged. Calls no model.
 */
export function regradeRecord(
  record: RunRecord,
  cases: LoadedCase[],
  network: Network,
  searchIndex: SearchIndex,
  now: () => Date = () => new Date(),
): RegradeResult {
  const byId = new Map(cases.map((evalCase) => [evalCase.id, evalCase]));
  const issues: RegradeIssue[] = [];

  const regraded = record.cases.map((caseRecord) => {
    if (caseRecord.outcome !== "pass" && caseRecord.outcome !== "fail") return caseRecord;
    const evalCase = byId.get(caseRecord.id);
    if (!evalCase) {
      issues.push({ case: caseRecord.id, message: "no longer defined in evals/cases/; kept as recorded" });
      return caseRecord;
    }
    try {
      return regradeCase(caseRecord, evalCase, network, searchIndex);
    } catch (error) {
      if (!(error instanceof RebuildError)) throw error;
      issues.push({ case: caseRecord.id, message: `${error.message}; kept as recorded` });
      return caseRecord;
    }
  });

  return {
    record: { ...record, cases: regraded, summary: summarizeRun(regraded), regraded_at: now().toISOString() },
    issues,
  };
}
