/**
 * npm run eval:decide -- <baseline.json> <replicate.json> <candidate.json>
 *
 * Applies the decision rule of the `assistant-evals` spec to three run
 * records: the published baseline, a second run of the baseline
 * configuration, and a candidate. Offline: no model call, no API key, and
 * nothing is written.
 *
 * All three records are re-graded in memory with today's graders and cases
 * first, so they are judged by the same grader version without a version
 * field in the record. A case that refuses to re-grade makes the verdict
 * `no_verdict`. See design.md (reduce-cost-per-question), decision 5.
 */

import { readFileSync } from "node:fs";

import { loadCorpus } from "@/lib/corpus/load";
import { buildSearchIndex } from "@/lib/corpus/search";
import { loadCases } from "@/lib/evals/cases";
import { decide, noVerdict, type DecideResult } from "@/lib/evals/decide";
import { regradeRecord } from "@/lib/evals/regrade";
import type { CaseRecord, RunRecord } from "@/lib/evals/types";
import { loadNetwork } from "@/lib/network/load";

const [baselineFile, replicateFile, candidateFile] = process.argv.slice(2);
if (!baselineFile || !replicateFile || !candidateFile) {
  console.error(
    "eval:decide: usage: npm run eval:decide -- <baseline.json> <replicate.json> <candidate.json>",
  );
  process.exit(1);
}

const network = loadNetwork();
const cases = loadCases(network);
const searchIndex = buildSearchIndex(loadCorpus());

const files = { baseline: baselineFile, replicate: replicateFile, candidate: candidateFile };
const records = {} as Record<keyof typeof files, RunRecord>;
const refused: string[] = [];
for (const [role, file] of Object.entries(files) as Array<[keyof typeof files, string]>) {
  const original = JSON.parse(readFileSync(file, "utf8")) as RunRecord;
  const { record, issues } = regradeRecord(original, cases, network, searchIndex);
  records[role] = record;
  for (const issue of issues) refused.push(`${role} (${file}): case ${issue.case} could not be re-graded: ${issue.message}`);
}

const result: DecideResult =
  refused.length > 0 ? noVerdict(refused) : decide(records);

const usd = (x: number | null) => (x === null ? "unknown" : `$${x.toFixed(4)}`);
const pct = (x: number | null) => (x === null ? "unknown" : `${x.toFixed(1)}%`);
const describe = (role: string, file: string, r: RunRecord) =>
  `${role}: ${file} — ${r.model}, effort ${r.effort}, caching ${r.prompt_caching === true ? "on" : "off"}, ` +
  `prompt ${r.prompt_hash.slice(0, 12)}, ${r.status}`;
const lastTurn = (c: CaseRecord | undefined) => c?.turns[c.turns.length - 1];
const indent = (text: string) => text.split("\n").map((line) => `      ${line}`).join("\n");

console.log("Decision rule: assistant-evals spec, 'A cheaper configuration is accepted only by a rule fixed in advance'.");
for (const role of ["baseline", "replicate", "candidate"] as const) {
  console.log(describe(role, files[role], records[role]));
}

console.log(`\nVerdict: ${result.verdict}`);
for (const reason of result.reasons) console.log(`  - ${reason}`);

if (result.checks.length > 0) {
  console.log("\nChecks:");
  for (const check of result.checks) console.log(`  [${check.pass ? "pass" : "FAIL"}] ${check.name}: ${check.detail}`);
}

if (result.mcnemar) {
  const { pass_to_fail, fail_to_pass, p } = result.mcnemar;
  console.log(
    `\nMcNemar exact against the baseline run (context only, never decides): ` +
      `pass → fail ${pass_to_fail}, fail → pass ${fail_to_pass}, two-sided p = ${p.toFixed(4)}`,
  );
}

if (result.passes) {
  const { baseline, replicate, candidate } = result.passes;
  console.log(`Passes: baseline ${baseline}, replicate ${replicate}, candidate ${candidate}`);
}

if (result.cost) {
  const c = result.cost;
  console.log(
    `\nCost per question, median:\n` +
      `  cold:     candidate ${usd(c.candidate_cold_median)} against baseline ${usd(c.baseline_cold_median)} = ` +
      `${pct(c.cold_pct_of_baseline)} (limit ${usd(c.limit)}, 50%)\n` +
      `  measured: candidate ${usd(c.candidate_measured_median)} against baseline ${usd(c.baseline_measured_median)} = ` +
      `${pct(c.measured_pct_of_baseline)}`,
  );
}

if (result.verdict !== "no_verdict") {
  console.log(`\nCases to read (${result.toRead.length}): every case whose outcome in the candidate differs from either baseline run`);
  const byId = (r: RunRecord) => new Map(r.cases.map((c) => [c.id, c]));
  const maps = { baseline: byId(records.baseline), replicate: byId(records.replicate), candidate: byId(records.candidate) };
  for (const item of result.toRead) {
    console.log(
      `\n  ${item.id} (${item.area}) — baseline ${item.baseline}, replicate ${item.replicate}, candidate ${item.candidate}`,
    );
    for (const role of ["candidate", "baseline", "replicate"] as const) {
      const record = maps[role].get(item.id);
      const failing = Object.entries(record?.graders ?? {})
        .filter(([, grader]) => !grader.pass)
        .map(([name, grader]) => `${name}: ${grader.reasons.join("; ")}`);
      console.log(`    ${role} answer${failing.length > 0 ? ` (not passing — ${failing.join(" | ")})` : ""}:`);
      console.log(indent(lastTurn(record)?.answer ?? "(no answer recorded)"));
      if (record && record.sign_only.length > 0) console.log(`      sign-only figures to read: ${record.sign_only.join(", ")}`);
    }
  }
  if (result.verdict === "accept_provisional") {
    console.log("\nRead each listed case and record the reading in evals/decision-log.md; a figure no tool produced rejects the candidate.");
  }
}
