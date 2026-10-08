/**
 * The trajectory grader: were the right tools called, the wrong ones not,
 * and — where it matters — in the right order? "Order" is by model
 * iteration: two tools requested in the same iteration ran in parallel and
 * are not ordered. See design.md (add-eval-harness), decision 7.
 */

import type { ToolCallRecord } from "@/lib/assistant/loop";
import type { GradedTurn } from "@/lib/evals/graders/input";
import type { GraderResult, ToolRequirement, TrajectoryExpectation } from "@/lib/evals/types";

/**
 * True when a call returned something. A search with no match returns a
 * single text block saying so, not an error — that counts as empty.
 */
function hasNonEmptyResult(call: ToolCallRecord): boolean {
  if (call.isError || call.result === null || call.result === undefined) return false;
  if (Array.isArray(call.result)) {
    return call.result.some(
      (item) => !(typeof item === "object" && item !== null && (item as { type?: unknown }).type === "text"),
    );
  }
  return true;
}

function inputMatches(call: ToolCallRecord, expected: Record<string, unknown>): boolean {
  const input = (call.input ?? {}) as Record<string, unknown>;
  return Object.entries(expected).every(([key, value]) => JSON.stringify(input[key]) === JSON.stringify(value));
}

function describe(requirement: ToolRequirement): string {
  const parts = [requirement.tool];
  if (requirement.input) parts.push(`with ${JSON.stringify(requirement.input)}`);
  if (requirement.nonempty_result) parts.push("returning a non-empty result");
  return parts.join(" ");
}

export function gradeTrajectory(turn: GradedTurn, expected: TrajectoryExpectation): GraderResult {
  const calls = turn.toolCalls;
  const reasons: string[] = [];

  for (const item of expected.required ?? []) {
    const requirement: ToolRequirement = typeof item === "string" ? { tool: item } : item;
    const met = calls.some(
      (call) =>
        call.name === requirement.tool &&
        (!requirement.input || inputMatches(call, requirement.input)) &&
        (!requirement.nonempty_result || hasNonEmptyResult(call)),
    );
    if (!met) reasons.push(`required: ${describe(requirement)} — not called`);
  }

  if (expected.required_any && !calls.some((call) => expected.required_any!.includes(call.name))) {
    reasons.push(`required one of: ${expected.required_any.join(", ")} — none called`);
  }

  for (const name of expected.forbidden ?? []) {
    if (calls.some((call) => call.name === name)) reasons.push(`forbidden: ${name} was called`);
  }

  const firstIteration = (name: string) =>
    calls.find((call) => call.name === name)?.iteration ?? Number.POSITIVE_INFINITY;
  for (const [before, after] of expected.order ?? []) {
    const a = firstIteration(before);
    const b = firstIteration(after);
    if (a === Number.POSITIVE_INFINITY || b === Number.POSITIVE_INFINITY) continue; // `required` reports absence
    if (!(a < b)) {
      reasons.push(`order: ${before} (iteration ${a}) must come before ${after} (iteration ${b})`);
    }
  }

  return { pass: reasons.length === 0, reasons };
}
