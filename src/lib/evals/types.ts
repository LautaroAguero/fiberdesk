/**
 * The shapes the eval suite reads and writes: cases (input, from
 * `evals/cases/`), grader results, and run records (output, to
 * `evals/runs/`). See design.md (add-eval-harness), decisions 6, 7 and 11.
 */

import type { ModelCallRecord } from "@/lib/assistant/usage";

/** The areas cases are grouped into. Each capability change adds its own. */
export const AREAS = ["budget", "docs", "abstention", "conversation"] as const;
export type Area = (typeof AREAS)[number];

/** One tool a case requires, optionally pinned to input values or a non-empty result. */
export interface ToolRequirement {
  tool: string;
  /** Every listed key must equal the call's input value, for at least one call of `tool`. */
  input?: Record<string, unknown>;
  /** At least one call of `tool` returned a non-empty, non-error result. */
  nonempty_result?: boolean;
}

export interface TrajectoryExpectation {
  /** Every requirement must be met. A bare string is a tool that must be called at least once. */
  required?: Array<string | ToolRequirement>;
  /** At least one of these tools must be called. */
  required_any?: string[];
  /** None of these tools may be called. */
  forbidden?: string[];
  /** For each `[a, b]`, the first call of `a` is in an earlier iteration than the first call of `b`. */
  order?: Array<[string, string]>;
}

export interface HighlightExpectation {
  /** `equals`: the payload's ids are exactly `ids`. `contains`: they include every one of `ids`. */
  mode: "equals" | "contains";
  /** Written by hand — never computed by the engine under test. */
  ids: string[];
  /**
   * What the hand-written set claims to be, so a unit test can hold it to
   * `seed/expected-budgets.json`. `non_passing`: the NAPs whose status is not `pass`.
   */
  oracle?: "non_passing";
}

export interface Expectations {
  trajectory?: TrajectoryExpectation;
  highlight?: HighlightExpectation;
  grounding?: boolean;
  abstention?: boolean;
  /** Figures that must appear in the answer. */
  figures?: number[];
  citation?: boolean;
}

export interface EvalCase {
  id: string;
  area: Area;
  /** What this case converts — a verification.md section, or "new". */
  source: string;
  /** User turns, in order. The graders judge the answer to the last. */
  turns: string[];
  expect: Expectations;
}

/** Cases loaded from disk, with the file each came from. */
export interface LoadedCase extends EvalCase {
  file: string;
}

export type GraderName = "trajectory" | "highlight" | "grounding" | "abstention" | "figures" | "citation";

export interface GraderResult {
  pass: boolean;
  /** Why it failed — or, for a pass with something worth a human look, a note. Empty on a clean pass. */
  reasons: string[];
}

export type CaseOutcome = "pass" | "fail" | "error" | "skipped_budget";

/** One tool call as the record keeps it: no result, which the seed reproduces. */
export interface RecordedToolCall {
  name: string;
  input: unknown;
  iteration: number;
  is_error: boolean;
  /**
   * SHA-256 of the canonical JSON of the parsed result; `null` for an errored
   * call. Lets offline re-grading prove a re-dispatched result is the one the
   * model saw. See design.md, decision 15.
   */
  result_sha256: string | null;
}

export interface TurnRecord {
  user: string;
  /** The final assistant text of this turn. */
  answer: string;
  /** Titles of documents the answer's citation blocks point to. */
  cited_sources: string[];
  stop_reason: string | null;
  trajectory: RecordedToolCall[];
  /** Entity ids in the payload the server projected for this turn. */
  highlight_ids: string[];
  calls: ModelCallRecord[];
  /** `null` when any call was unpriced. */
  cost_usd: number | null;
  latency_ms: number;
}

export interface CaseRecord {
  id: string;
  area: Area;
  outcome: CaseOutcome;
  /** Set when `outcome` is `error`. */
  error?: string;
  graders: Partial<Record<GraderName, GraderResult>>;
  /** Answer figures that matched a source only by absolute value — for a human to read. */
  sign_only: number[];
  turns: TurnRecord[];
  cost_usd: number | null;
}

/** A pass rate with its 95% Wilson interval, as fractions in [0, 1]. */
export interface RateSummary {
  passes: number;
  completed: number;
  errors: number;
  skipped: number;
  rate: number | null;
  low: number | null;
  high: number | null;
}

export interface RunSummary {
  overall: RateSummary;
  by_area: Record<string, RateSummary>;
  /** Per question = per user turn. US dollars. */
  cost_per_question: { n: number; median: number | null; p95: number | null };
  latency_ms_per_question: { n: number; median: number | null; p95: number | null };
}

export type RunStatus = "complete" | "partial" | "incomplete";

export interface RunRecord {
  schema_version: 1;
  started_at: string;
  finished_at: string;
  git_commit: string | null;
  model: string;
  effort: string;
  overridden: { model: boolean; effort: boolean };
  prompt_hash: string;
  max_usd: number;
  spent_usd: number;
  /** `partial`: the cap or an unpriced model stopped the run. `incomplete`: some case errored. */
  status: RunStatus;
  stopped_reason: string | null;
  unpriced_models: string[];
  summary: RunSummary;
  cases: CaseRecord[];
  /** Set when the graders were re-applied offline after the run. See design.md, decision 15. */
  regraded_at?: string;
}
