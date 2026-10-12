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
import { AREAS, type EvalCase } from "@/lib/evals/types";
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

  test("an oracle naming SUB-099 fails, naming the case", () => {
    const error = loadError({
      "budget.json": [validCase({ expect: { highlight: { mode: "equals", ids: ["SUB-099"] } } })],
    });
    expect(error.message).toContain("[budget-failing-es]");
    expect(error.message).toContain("SUB-099");
  });

  test("an oracle naming a subscriber or a fiber run loads, and one naming FR-99 does not", () => {
    const withSubscriber = caseDir({
      "trace.json": [validCase({ expect: { highlight: { mode: "equals", ids: ["SUB-025"] } } })],
    });
    expect(loadCases(network, withSubscriber)).toHaveLength(1);

    const withRun = caseDir({
      "cut.json": [validCase({ expect: { highlight: { mode: "equals", ids: ["FR-03", "NAP-03"] } } })],
    });
    expect(loadCases(network, withRun)).toHaveLength(1);

    const error = loadError({
      "cut.json": [validCase({ expect: { highlight: { mode: "equals", ids: ["FR-99"] } } })],
    });
    expect(error.message).toContain("FR-99");
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

describe("the committed case set", () => {
  test("loads, covers every area, and holds the reference question in both languages", () => {
    const cases = loadCases(network);
    for (const area of AREAS) {
      expect(cases.filter((c) => c.area === area).length, area).toBeGreaterThan(0);
    }
    const tagged = cases.filter((c) => c.expect.highlight?.oracle === "non_passing").map((c) => c.id);
    expect(tagged).toEqual(expect.arrayContaining(["budget-failing-en", "budget-failing-es"]));
  });
});

describe("the trace cases agree with seed/expected-traces.json", () => {
  interface ExpectedTraces {
    subscribers: Record<string, Record<string, unknown>>;
  }
  const traces = JSON.parse(
    readFileSync(path.join(process.cwd(), "seed", "expected-traces.json"), "utf8"),
  ) as ExpectedTraces;
  const traceCases = loadCases(network).filter((c) => c.id.startsWith("trace-"));

  /** The subscriber a case pins its trace call to, if any. */
  function tracedSubscriber(evalCase: (typeof traceCases)[number]): string | undefined {
    for (const item of evalCase.expect.trajectory?.required ?? []) {
      if (typeof item !== "string" && item.tool === "trace_subscriber_link") {
        return item.input?.subscriber_id as string | undefined;
      }
    }
    return undefined;
  }

  test("the seven trace cases are present and all in the trace area", () => {
    expect(traceCases.map((c) => c.id).sort()).toEqual([
      "trace-by-name-es",
      "trace-cascade-es",
      "trace-direct-en",
      "trace-failing-es",
      "trace-nap06-es",
      "trace-ont-verdict-es",
      "trace-unknown-es",
    ]);
    expect(traceCases.every((c) => c.area === "trace")).toBe(true);
  });

  test("every figure in a trace case equals a figure of the oracle for the subscriber it names", () => {
    const withFigures = traceCases.filter((c) => c.expect.figures !== undefined);
    expect(withFigures.length).toBeGreaterThan(0);

    for (const evalCase of withFigures) {
      const subscriberId = tracedSubscriber(evalCase);
      expect(subscriberId, evalCase.id).toBeDefined();
      const oracle = traces.subscribers[subscriberId!];
      expect(oracle, evalCase.id).toBeDefined();

      const oracleFigures = Object.values(oracle).filter((value): value is number => typeof value === "number");
      for (const figure of evalCase.expect.figures!) {
        expect(oracleFigures, `${evalCase.id}: ${figure}`).toContain(figure);
      }
    }
  });

  test("a trace case that highlights names the subscriber it traces", () => {
    for (const evalCase of traceCases.filter((c) => c.expect.highlight !== undefined)) {
      const subscriberId = tracedSubscriber(evalCase);
      expect(evalCase.expect.highlight!.ids, evalCase.id).toContain(subscriberId);
    }
  });
});

describe("the cut cases agree with seed/expected-cut-impacts.json", () => {
  interface ExpectedCut {
    naps_out_of_service: string[];
    subscribers_out_of_service: string[];
    runs_out_of_service: string[];
    counts: { naps: number; subscribers: number; runs: number };
  }
  const oracle = JSON.parse(
    readFileSync(path.join(process.cwd(), "seed", "expected-cut-impacts.json"), "utf8"),
  ) as { elements: Record<string, ExpectedCut> };
  const cutCases = loadCases(network).filter((c) => c.id.startsWith("cut-"));

  /** The element a case cuts: the one its tool call pins, else the first fiber run or NAP its first turn names. */
  function cutElement(evalCase: (typeof cutCases)[number]): string | undefined {
    for (const item of evalCase.expect.trajectory?.required ?? []) {
      if (typeof item !== "string" && item.tool === "list_cut_impact") {
        return item.input?.element_id as string | undefined;
      }
    }
    return evalCase.turns[0].match(/\b(?:FR|NAP)-\d+\b/)?.[0];
  }

  test("the six cut cases are present and all in the cut area", () => {
    expect(cutCases.map((c) => c.id).sort()).toEqual([
      "cut-count-followup-es",
      "cut-feeder-cascade-es",
      "cut-leaf-en",
      "cut-nap-es",
      "cut-olt-es",
      "cut-unknown-es",
    ]);
    expect(cutCases.every((c) => c.area === "cut")).toBe(true);
  });

  test("every figure is a count of the oracle for the element the case cuts", () => {
    const withFigures = cutCases.filter((c) => c.expect.figures !== undefined);
    expect(withFigures.length).toBeGreaterThan(0);

    for (const evalCase of withFigures) {
      const element = cutElement(evalCase);
      expect(element, evalCase.id).toBeDefined();
      const expected = oracle.elements[element!];
      expect(expected, evalCase.id).toBeDefined();
      for (const figure of evalCase.expect.figures!) {
        expect(Object.values(expected.counts), `${evalCase.id}: ${figure}`).toContain(figure);
      }
      // The figure that answers "how many customers" is the subscribers count.
      expect(evalCase.expect.figures, evalCase.id).toContain(expected.counts.subscribers);
    }
  });

  test("every highlight oracle is the cut element plus its NAPs and subscribers, and no dark run", () => {
    const withHighlight = cutCases.filter((c) => c.expect.highlight !== undefined);
    expect(withHighlight.length).toBeGreaterThan(0);

    for (const evalCase of withHighlight) {
      const element = cutElement(evalCase)!;
      const expected = oracle.elements[element];
      expect(expected, evalCase.id).toBeDefined();
      expect(evalCase.expect.highlight!.mode, evalCase.id).toBe("equals");
      expect([...evalCase.expect.highlight!.ids].sort(), evalCase.id).toEqual(
        [
          ...new Set([element, ...expected.naps_out_of_service, ...expected.subscribers_out_of_service]),
        ].sort(),
      );
      for (const runId of expected.runs_out_of_service) {
        expect(evalCase.expect.highlight!.ids, evalCase.id).not.toContain(runId);
      }
    }
  });

  test("the abstention cases name no highlight and no figure", () => {
    for (const id of ["cut-unknown-es", "cut-olt-es"]) {
      const evalCase = cutCases.find((c) => c.id === id)!;
      expect(evalCase.expect.abstention, id).toBe(true);
      expect(evalCase.expect.highlight, id).toBeUndefined();
      expect(evalCase.expect.figures, id).toBeUndefined();
    }
  });
});

describe("5.1 a case can carry a selected point", () => {
  const withPoint = (point: unknown) => ({ ...validCase(), map_context: { selected_point: point } });

  test("a point inside the city loads, and is kept on the case", () => {
    const cases = loadCases(network, caseDir({ "a.json": [withPoint({ lat: -27.4659, lon: -58.97 })] }));
    expect(cases[0].map_context).toEqual({ selected_point: { lat: -27.4659, lon: -58.97 } });
  });

  test("a case without one loads with no map context", () => {
    const cases = loadCases(network, caseDir({ "a.json": [validCase()] }));
    expect(cases[0].map_context).toBeUndefined();
  });

  test("a point outside the city fails, naming the case and the problem", () => {
    const error = loadError({ "a.json": [withPoint({ lat: -34.6037, lon: -58.3816 })] });
    expect(error.message).toContain("[budget-failing-es]");
    expect(error.message).toContain("outside the modelled city");
  });

  test("a malformed point fails, naming the case", () => {
    const error = loadError({ "a.json": [withPoint({ lat: "north", lon: -58.97 })] });
    expect(error.message).toContain("[budget-failing-es]");
    expect(error.message).toContain("finite numeric");
  });
});
