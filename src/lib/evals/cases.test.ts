import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import {
  CASES_DIR,
  CaseValidationError,
  checkNonPassingOracles,
  EXPECTED_BUDGETS_PATH,
  loadCases,
  type ExpectedBudgets,
} from "@/lib/evals/cases";
import type { EvalCase } from "@/lib/evals/types";
import { loadNetwork } from "@/lib/network/load";

const network = loadNetwork();

const validCase = (overrides: Partial<EvalCase> = {}): EvalCase => ({
  id: "budget-failing-es",
  area: "budget",
  source: "new",
  turns: ["¿qué cajas no cierran el presupuesto óptico?"],
  expect: {
    trajectory: {
      required: ["summarize_optical_budgets", "detail_optical_budget"],
      order: [["summarize_optical_budgets", "detail_optical_budget"]],
    },
    highlight: { mode: "equals", ids: ["NAP-09", "NAP-12"], oracle: "non_passing" },
    grounding: true,
  },
  ...overrides,
});

/** Writes `files` (name → contents) into a fresh temporary directory. */
function caseDir(files: Record<string, unknown>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "fiberdesk-cases-"));
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), typeof contents === "string" ? contents : JSON.stringify(contents));
  }
  return dir;
}

function loadError(files: Record<string, unknown>): CaseValidationError {
  try {
    loadCases(network, caseDir(files));
  } catch (error) {
    if (error instanceof CaseValidationError) return error;
    throw error;
  }
  throw new Error("expected loadCases to throw");
}

describe("loadCases", () => {
  test("a valid set loads, each case tagged with its file", () => {
    const cases = loadCases(network, caseDir({ "budget.json": [validCase()] }));
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({ id: "budget-failing-es", file: "budget.json" });
  });

  test("a duplicate id fails, naming both files", () => {
    const error = loadError({ "a.json": [validCase()], "b.json": [validCase()] });
    expect(error.message).toContain("b.json [budget-failing-es]");
    expect(error.message).toContain("first defined in a.json");
  });

  test("an oracle naming NAP-13 fails, naming the case", () => {
    const error = loadError({
      "budget.json": [validCase({ expect: { highlight: { mode: "equals", ids: ["NAP-13"] } } })],
    });
    expect(error.message).toContain("[budget-failing-es]");
    expect(error.message).toContain("NAP-13");
  });

  test("an unknown tool name fails", () => {
    const error = loadError({
      "budget.json": [validCase({ expect: { trajectory: { required: ["summarise_budgets"] } } })],
    });
    expect(error.message).toContain('unknown tool "summarise_budgets"');
  });

  test("an unknown area fails", () => {
    const error = loadError({ "x.json": [{ ...validCase(), area: "billing" }] });
    expect(error.message).toContain('unknown area "billing"');
  });

  test("empty turns fail", () => {
    const error = loadError({ "budget.json": [validCase({ turns: [] })] });
    expect(error.message).toContain("`turns` must be a non-empty array");
  });

  test("malformed JSON fails, naming the file", () => {
    const error = loadError({ "broken.json": "[{ not json" });
    expect(error.message).toContain("broken.json: not valid JSON");
  });

  test("a case with no grader fails", () => {
    const error = loadError({ "budget.json": [validCase({ expect: {} })] });
    expect(error.message).toContain("declares no grader");
  });

  test("every problem is reported, not just the first", () => {
    const error = loadError({
      "a.json": [validCase({ turns: [] })],
      "b.json": "nope",
    });
    expect(error.issues).toHaveLength(2);
  });
});

describe("the non_passing oracle agrees with seed/expected-budgets.json", () => {
  const expected = JSON.parse(readFileSync(EXPECTED_BUDGETS_PATH, "utf8")) as ExpectedBudgets;

  test("a case listing only NAP-09 is caught", () => {
    const [stale] = loadCases(
      network,
      caseDir({
        "budget.json": [validCase({ expect: { highlight: { mode: "equals", ids: ["NAP-09"], oracle: "non_passing" } } })],
      }),
    );
    expect(checkNonPassingOracles([stale], expected)).toEqual([
      "budget.json [budget-failing-es]: lists NAP-09; expected budgets say NAP-09, NAP-12",
    ]);
  });

  test("a case listing NAP-09 and NAP-12 agrees", () => {
    const cases = loadCases(network, caseDir({ "budget.json": [validCase()] }));
    expect(checkNonPassingOracles(cases, expected)).toEqual([]);
  });

  test("every committed case tagged non_passing agrees", () => {
    // Vacuous until evals/cases/ exists — group 8 of tasks.md writes it.
    if (!existsSync(CASES_DIR)) return;
    const cases = loadCases(network);
    expect(checkNonPassingOracles(cases, expected)).toEqual([]);
  });
});
