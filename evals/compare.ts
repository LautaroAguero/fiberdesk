/**
 * npm run eval:compare -- <runA.json> <runB.json>
 *
 * Lists every case whose outcome flipped between two run records. Offline:
 * reads two files, calls nothing. See
 * openspec/changes/archive/2026-10-08-add-eval-harness/design.md, decision 13.
 */

import { readFileSync } from "node:fs";

import { compareRuns } from "@/lib/evals/compare";
import { formatComparison } from "@/lib/evals/report";
import type { RunRecord } from "@/lib/evals/types";

const [fileA, fileB] = process.argv.slice(2);
if (!fileA || !fileB) {
  console.error("eval:compare: usage: npm run eval:compare -- <runA.json> <runB.json>");
  process.exit(1);
}

const read = (file: string) => JSON.parse(readFileSync(file, "utf8")) as RunRecord;
const [a, b] = [read(fileA), read(fileB)];

console.log(`A: ${fileA} — ${a.model}, effort ${a.effort}, prompt ${a.prompt_hash.slice(0, 12)}`);
console.log(`B: ${fileB} — ${b.model}, effort ${b.effort}, prompt ${b.prompt_hash.slice(0, 12)}`);
console.log(formatComparison(compareRuns(a, b)));
