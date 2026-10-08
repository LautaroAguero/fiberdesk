/**
 * Reads and validates the eval cases in `evals/cases/`.
 *
 * All-or-nothing across every file, like the network and corpus loaders:
 * every problem is collected and reported together, naming the file and the
 * case, and a partially valid set is never returned. A suite that silently
 * skipped a malformed case would report a pass rate over fewer cases than
 * anyone thinks it covers. See design.md (add-eval-harness), decision 6.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { buildToolDefinitions } from "@/lib/assistant/tool-definitions";
import type { Network } from "@/lib/network/types";
import { AREAS, type LoadedCase } from "@/lib/evals/types";

/** Location of the cases, relative to the project root. */
export const CASES_DIR = path.join(process.cwd(), "evals", "cases");

export interface CaseValidationIssue {
  file: string;
  /** The case id, or its index when it has no usable id. */
  case?: string;
  message: string;
}

export class CaseValidationError extends Error {
  constructor(public readonly issues: CaseValidationIssue[]) {
    super(
      `Invalid eval cases (${issues.length} issue${issues.length === 1 ? "" : "s"}):\n` +
        issues.map((i) => `  - ${i.file}${i.case ? ` [${i.case}]` : ""}: ${i.message}`).join("\n"),
    );
    this.name = "CaseValidationError";
  }
}

const EXPECTATION_KEYS = ["trajectory", "highlight", "grounding", "abstention", "figures", "citation"];
const TRAJECTORY_KEYS = ["required", "required_any", "forbidden", "order"];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

/** Every id a highlight may name: the OLT, NAPs, fiber runs and subscribers. */
function entityIds(network: Network): Set<string> {
  return new Set([
    network.olt.id,
    ...network.splitters.map((nap) => nap.id),
    ...network.fiber_runs.map((run) => run.id),
    ...network.subscribers.map((sub) => sub.id),
  ]);
}

/** Validates one case's fields. Returns its problems; empty when valid. */
function validateCase(raw: unknown, toolNames: Set<string>, entities: Set<string>): string[] {
  if (!isObject(raw)) return ["a case must be an object"];
  const problems: string[] = [];

  if (typeof raw.id !== "string" || raw.id.length === 0) problems.push("`id` must be a non-empty string");
  if (!AREAS.includes(raw.area as (typeof AREAS)[number])) {
    problems.push(`unknown area ${JSON.stringify(raw.area)}; expected one of ${AREAS.join(", ")}`);
  }
  if (typeof raw.source !== "string" || raw.source.length === 0) problems.push("`source` must be a non-empty string");
  if (!isStringArray(raw.turns) || raw.turns.length === 0 || raw.turns.some((t) => t.trim() === "")) {
    problems.push("`turns` must be a non-empty array of non-empty strings");
  }

  const expect = raw.expect;
  if (!isObject(expect)) return [...problems, "`expect` must be an object"];

  const keys = Object.keys(expect);
  if (keys.length === 0) problems.push("`expect` declares no grader");
  for (const key of keys) {
    if (!EXPECTATION_KEYS.includes(key)) problems.push(`unknown expectation \`${key}\``);
  }

  const checkTool = (name: unknown, where: string) => {
    if (typeof name !== "string" || !toolNames.has(name)) {
      problems.push(`unknown tool ${JSON.stringify(name)} in ${where}`);
    }
  };

  if (expect.trajectory !== undefined) {
    const t = expect.trajectory;
    if (!isObject(t)) {
      problems.push("`trajectory` must be an object");
    } else {
      for (const key of Object.keys(t)) {
        if (!TRAJECTORY_KEYS.includes(key)) problems.push(`unknown trajectory field \`${key}\``);
      }
      if (t.required !== undefined) {
        if (!Array.isArray(t.required)) problems.push("`trajectory.required` must be an array");
        else
          for (const item of t.required) {
            if (typeof item === "string") checkTool(item, "trajectory.required");
            else if (isObject(item)) {
              checkTool(item.tool, "trajectory.required");
              if (item.input !== undefined && !isObject(item.input)) problems.push("`input` must be an object");
            } else problems.push("`trajectory.required` entries must be a tool name or an object");
          }
      }
      for (const key of ["required_any", "forbidden"] as const) {
        if (t[key] === undefined) continue;
        if (!isStringArray(t[key])) problems.push(`\`trajectory.${key}\` must be an array of tool names`);
        else (t[key] as string[]).forEach((name) => checkTool(name, `trajectory.${key}`));
      }
      if (t.order !== undefined) {
        if (!Array.isArray(t.order) || !t.order.every((pair) => isStringArray(pair) && pair.length === 2)) {
          problems.push("`trajectory.order` must be an array of [before, after] tool-name pairs");
        } else (t.order as string[][]).flat().forEach((name) => checkTool(name, "trajectory.order"));
      }
    }
  }

  if (expect.highlight !== undefined) {
    const h = expect.highlight;
    if (!isObject(h) || (h.mode !== "equals" && h.mode !== "contains") || !isStringArray(h.ids)) {
      problems.push("`highlight` must be { mode: \"equals\" | \"contains\", ids: string[] }");
    } else {
      for (const id of h.ids) {
        if (!entities.has(id)) problems.push(`highlight oracle names ${id}, which the network does not contain`);
      }
      if (h.oracle !== undefined && h.oracle !== "non_passing") {
        problems.push(`unknown highlight oracle tag ${JSON.stringify(h.oracle)}`);
      }
    }
  }

  for (const key of ["grounding", "abstention", "citation"] as const) {
    if (expect[key] !== undefined && typeof expect[key] !== "boolean") problems.push(`\`${key}\` must be a boolean`);
  }
  if (
    expect.figures !== undefined &&
    (!Array.isArray(expect.figures) || !expect.figures.every((f) => typeof f === "number" && Number.isFinite(f)))
  ) {
    problems.push("`figures` must be an array of numbers");
  }

  return problems;
}

/**
 * Reads every `.json` file in `dir` — each an array of cases — and either
 * returns all of them, in file then array order, or throws
 * {@link CaseValidationError} naming every problem found.
 */
export function loadCases(network: Network, dir: string = CASES_DIR): LoadedCase[] {
  const toolNames = new Set(buildToolDefinitions(network).map((tool) => tool.name));
  const entities = entityIds(network);

  const fileNames = readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort();

  const cases: LoadedCase[] = [];
  const issues: CaseValidationIssue[] = [];
  const fileById = new Map<string, string>();

  for (const file of fileNames) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
    } catch (error) {
      issues.push({ file, message: `not valid JSON: ${error instanceof Error ? error.message : String(error)}` });
      continue;
    }
    if (!Array.isArray(parsed)) {
      issues.push({ file, message: "a case file must hold an array of cases" });
      continue;
    }

    parsed.forEach((raw, index) => {
      const label = isObject(raw) && typeof raw.id === "string" && raw.id ? raw.id : `#${index}`;
      const problems = validateCase(raw, toolNames, entities);
      for (const message of problems) issues.push({ file, case: label, message });
      if (problems.length > 0) return;

      const evalCase = raw as unknown as LoadedCase;
      const firstFile = fileById.get(evalCase.id);
      if (firstFile !== undefined) {
        issues.push({ file, case: evalCase.id, message: `duplicate id, first defined in ${firstFile}` });
        return;
      }
      fileById.set(evalCase.id, file);
      cases.push({ ...evalCase, file });
    });
  }

  if (fileNames.length === 0) issues.push({ file: dir, message: "no case files found" });
  if (issues.length > 0) throw new CaseValidationError(issues);
  return cases;
}

/** `seed/expected-budgets.json`, the hand-derived optical oracle — only the part read here. */
export interface ExpectedBudgets {
  naps: Record<string, { status: "pass" | "marginal" | "fail" }>;
}

/** Location of the hand-derived expected budgets, relative to the project root. */
export const EXPECTED_BUDGETS_PATH = path.join(process.cwd(), "seed", "expected-budgets.json");

/**
 * For every case whose highlight claims to be the `non_passing` set, checks
 * its hand-written ids against the NAPs `expected` says do not pass. Returns
 * one message per case that disagrees; empty when all agree.
 *
 * This is what keeps a seed edit from silently staling the eval: the case
 * ids stay hand-written, and this cross-check fails when they drift.
 */
export function checkNonPassingOracles(cases: LoadedCase[], expected: ExpectedBudgets): string[] {
  const nonPassing = Object.entries(expected.naps)
    .filter(([, nap]) => nap.status !== "pass")
    .map(([id]) => id)
    .sort();

  return cases
    .filter((evalCase) => evalCase.expect.highlight?.oracle === "non_passing")
    .flatMap((evalCase) => {
      const ids = [...(evalCase.expect.highlight?.ids ?? [])].sort();
      return ids.join(",") === nonPassing.join(",")
        ? []
        : [`${evalCase.file} [${evalCase.id}]: lists ${ids.join(", ")}; expected budgets say ${nonPassing.join(", ")}`];
    });
}
