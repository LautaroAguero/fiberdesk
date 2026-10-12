import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { promptCachingOn } from "@/lib/evals/record";
import type { RunRecord } from "@/lib/evals/types";

const BASELINE_FILE = path.join(process.cwd(), "evals", "runs", "2026-10-08T03-32-06Z.regraded.json");

describe("promptCachingOn", () => {
  test("the baseline record, loaded as-is, reads as caching off", () => {
    const baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf8")) as RunRecord;
    expect(baseline).not.toHaveProperty("prompt_caching");
    expect(promptCachingOn(baseline)).toBe(false);
  });

  test("reads the field when present", () => {
    expect(promptCachingOn({ prompt_caching: true })).toBe(true);
    expect(promptCachingOn({ prompt_caching: false })).toBe(false);
  });
});
