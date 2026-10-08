import { describe, expect, test } from "vitest";

import {
  DETAIL_TOOL_NAME,
  GET_OPTICAL_CONSTANTS_TOOL_NAME,
  SEARCH_DOCUMENTATION_TOOL_NAME,
} from "@/lib/assistant/tool-definitions";
import { gradeAbstention } from "@/lib/evals/graders/abstention";
import { gradeCitation } from "@/lib/evals/graders/citation";
import { gradeFigures } from "@/lib/evals/graders/figures";
import { gradeHighlight } from "@/lib/evals/graders/highlight";
import { call, turn } from "@/lib/evals/graders/test-helpers";

const detail = (napId: string) => call(DETAIL_TOOL_NAME, { nap_id: napId });

describe("gradeHighlight", () => {
  const oracle = { mode: "equals" as const, ids: ["NAP-09", "NAP-12"] };

  test("{NAP-09, NAP-12} equals the oracle", () => {
    expect(gradeHighlight(turn({ answer: "", toolCalls: [detail("NAP-09"), detail("NAP-12")] }), oracle)).toEqual({
      pass: true,
      reasons: [],
    });
  });

  test("an extra NAP-06 fails exact equality, naming it", () => {
    const result = gradeHighlight(
      turn({ answer: "", toolCalls: [detail("NAP-06"), detail("NAP-09"), detail("NAP-12")] }),
      oracle,
    );
    expect(result.reasons).toEqual(["unexpected in highlight: NAP-06"]);
  });

  test("contains tolerates extras but not omissions", () => {
    const contains = { mode: "contains" as const, ids: ["NAP-12"] };
    expect(gradeHighlight(turn({ answer: "", toolCalls: [detail("NAP-09"), detail("NAP-12")] }), contains).pass).toBe(true);
    expect(gradeHighlight(turn({ answer: "", toolCalls: [detail("NAP-09")] }), contains).reasons).toEqual([
      "missing from highlight: NAP-12",
    ]);
  });

  test("an empty oracle with equals requires an empty highlight", () => {
    const empty = { mode: "equals" as const, ids: [] };
    expect(gradeHighlight(turn({ answer: "", toolCalls: [] }), empty).pass).toBe(true);
    expect(gradeHighlight(turn({ answer: "", toolCalls: [detail("NAP-01")] }), empty).pass).toBe(false);
  });
});

describe("gradeAbstention", () => {
  test("ONT sensitivity declined, citing only the 28 dB class budget the tools returned, passes", () => {
    const result = gradeAbstention(
      turn({
        answer: "La sensibilidad del receptor de la ONT no está disponible; los presupuestos se calculan contra la clase B+ de 28 dB.",
        toolCalls: [call(GET_OPTICAL_CONSTANTS_TOOL_NAME, {})],
      }),
    );
    expect(result).toEqual({ pass: true, reasons: [] });
  });

  test("an invented −28 dBm sensitivity fails", () => {
    const result = gradeAbstention(
      turn({ answer: "La sensibilidad típica es −28 dBm.", toolCalls: [] }),
    );
    expect(result.reasons).toEqual(["ungrounded figure −28"]);
  });

  test("any highlight entry on a declined question fails", () => {
    const result = gradeAbstention(turn({ answer: "NAP-13 does not exist.", toolCalls: [detail("NAP-12")] }));
    expect(result.reasons).toEqual(["a declined question highlighted NAP-12"]);
  });
});

describe("gradeFigures", () => {
  test("both 0.22 and 0.25 are required", () => {
    expect(gradeFigures(turn({ answer: "El documento dice 0,22 dB/km; el sistema usa 0,25 dB/km." }), [0.22, 0.25]).pass).toBe(true);
    expect(gradeFigures(turn({ answer: "El sistema usa 0.25 dB/km." }), [0.22, 0.25]).reasons).toEqual([
      "required figure 0.22 not stated",
    ]);
  });
});

describe("gradeCitation", () => {
  const search = () => call(SEARCH_DOCUMENTATION_TOOL_NAME, { query: "cascaded splitter loss" });

  test("naming a returned source passes", () => {
    const result = gradeCitation(
      turn({ answer: "From the documentation (splitters-and-cascades.md): losses stack.", toolCalls: [search()] }),
    );
    expect(result.pass).toBe(true);
  });

  test("a native citation passes", () => {
    const result = gradeCitation(
      turn({ answer: "Losses stack.", citedSources: ["Cascaded Splitter Loss"], toolCalls: [search()] }),
    );
    expect(result.pass).toBe(true);
  });

  test("neither a citation nor a named source fails", () => {
    const result = gradeCitation(turn({ answer: "Losses stack.", toolCalls: [search()] }));
    expect(result.pass).toBe(false);
  });
});
