/**
 * npm run eval:regrade -- <run.json>
 *
 * Re-applies the current graders and case expectations to a recorded run,
 * offline: no model call, no API key. Writes <run>.regraded.json beside the
 * original and prints what flipped. See
 * openspec/changes/archive/2026-10-08-add-eval-harness/design.md, decision 15.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { MAX_TOKENS, THINKING } from "@/lib/assistant/config";
import { SYSTEM_PROMPT } from "@/lib/assistant/system-prompt";
import { buildToolDefinitions } from "@/lib/assistant/tool-definitions";
import { loadCorpus } from "@/lib/corpus/load";
import { buildSearchIndex } from "@/lib/corpus/search";
import { loadCases } from "@/lib/evals/cases";
import { compareRuns } from "@/lib/evals/compare";
import { regradeRecord } from "@/lib/evals/regrade";
import { promptHash } from "@/lib/evals/runner";
import { formatComparison, formatSummary } from "@/lib/evals/report";
import type { RunRecord } from "@/lib/evals/types";
import { loadNetwork } from "@/lib/network/load";

const [file] = process.argv.slice(2);
if (!file) {
  console.error("eval:regrade: usage: npm run eval:regrade -- <run.json>");
  process.exit(1);
}

const original = JSON.parse(readFileSync(file, "utf8")) as RunRecord;
const network = loadNetwork();
// The tool definitions are a grounding source, and re-grading uses today's. If the prompt or the
// tools changed since the run, say so: figures the model was given then may differ from now.
const currentHash = promptHash(SYSTEM_PROMPT, buildToolDefinitions(network), {
  max_tokens: MAX_TOKENS,
  thinking: THINKING,
  effort: original.effort,
});
if (currentHash !== original.prompt_hash) {
  console.warn(
    "Warning: the system prompt or tool definitions changed since this run " +
      `(recorded ${original.prompt_hash.slice(0, 12)}, now ${currentHash.slice(0, 12)}). ` +
      "Grounding uses today's tool definitions.\n",
  );
}

const { record, issues } = regradeRecord(original, loadCases(network), network, buildSearchIndex(loadCorpus()));

const out = path.join(path.dirname(file), `${path.basename(file, ".json").replace(/\.regraded$/, "")}.regraded.json`);
writeFileSync(out, JSON.stringify(record, null, 2) + "\n");

console.log(formatSummary(record));
console.log("\nAgainst the recorded grading:");
console.log(formatComparison(compareRuns(original, record)));
if (issues.length > 0) {
  console.log("\nNot re-graded:");
  for (const issue of issues) console.log(`- ${issue.case}: ${issue.message}`);
}
console.log(`\nRe-graded record written to ${path.relative(process.cwd(), out)}`);
