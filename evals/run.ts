/**
 * npm run eval -- --max-usd <cap> [--cases <id-glob>] [--model <id>] [--effort <level>]
 *
 * Runs the eval cases against the LIVE model and writes a run record to
 * evals/runs/. Spends real money, bounded by the required cap.
 *
 * Pure wiring, like the chat route: everything that decides anything lives
 * in src/lib/evals/ and is unit-tested there. See
 * openspec/changes/add-eval-harness/design.md, decision 5.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { EFFORT, MAX_TOKENS, MODEL, THINKING } from "@/lib/assistant/config";
import { getAnthropicApiKey } from "@/lib/assistant/env";
import { createAnthropicClient, createModelClient } from "@/lib/assistant/model-client";
import { SYSTEM_PROMPT } from "@/lib/assistant/system-prompt";
import { buildToolDefinitions } from "@/lib/assistant/tool-definitions";
import { loadCorpus } from "@/lib/corpus/load";
import { buildSearchIndex } from "@/lib/corpus/search";
import { loadCases } from "@/lib/evals/cases";
import { formatSummary } from "@/lib/evals/report";
import { runEvalSuite, type Effort } from "@/lib/evals/runner";
import { loadNetwork } from "@/lib/network/load";

const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];
const RUNS_DIR = path.join(process.cwd(), "evals", "runs");

function fail(message: string): never {
  console.error(`eval: ${message}`);
  process.exit(1);
}

/** `budget-*` → /^budget-.*$/ */
function globToRegExp(glob: string): RegExp {
  return new RegExp(`^${glob.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
}

function gitCommit(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "max-usd": { type: "string" },
      cases: { type: "string" },
      model: { type: "string" },
      effort: { type: "string" },
    },
  });

  // Both checks come before anything that could reach the API.
  const maxUsd = Number(values["max-usd"]);
  if (values["max-usd"] === undefined || !Number.isFinite(maxUsd) || maxUsd <= 0) {
    fail("a spend cap is required: --max-usd <positive amount in US dollars>");
  }
  if (values.effort !== undefined && !EFFORTS.includes(values.effort as Effort)) {
    fail(`--effort must be one of ${EFFORTS.join(", ")}`);
  }
  try {
    getAnthropicApiKey();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  const network = loadNetwork();
  const searchIndex = buildSearchIndex(loadCorpus());
  let cases = loadCases(network);
  if (values.cases) {
    const pattern = globToRegExp(values.cases);
    cases = cases.filter((evalCase) => pattern.test(evalCase.id));
    if (cases.length === 0) fail(`no case id matches ${values.cases}`);
  }

  const model = values.model ?? MODEL;
  const effort = (values.effort as Effort | undefined) ?? EFFORT;
  console.log(`Running ${cases.length} cases on ${model} (effort ${effort}), cap $${maxUsd}.`);

  const record = await runEvalSuite({
    cases,
    client: createModelClient(createAnthropicClient()),
    network,
    searchIndex,
    config: {
      model,
      effort,
      maxTokens: MAX_TOKENS,
      thinking: THINKING,
      system: SYSTEM_PROMPT,
      tools: buildToolDefinitions(network),
      overridden: { model: values.model !== undefined, effort: values.effort !== undefined },
    },
    maxUsd,
    gitCommit: gitCommit(),
    onProgress: ({ index, total, record: caseRecord, spentUsd }) => {
      const cost = caseRecord.cost_usd === null ? "unpriced" : `$${caseRecord.cost_usd.toFixed(4)}`;
      console.log(`[${index + 1}/${total}] ${caseRecord.outcome.padEnd(5)} ${caseRecord.id} (${cost}; spent $${spentUsd.toFixed(4)})`);
    },
  });

  mkdirSync(RUNS_DIR, { recursive: true });
  const file = path.join(RUNS_DIR, `${record.started_at.replace(/:/g, "-").replace(/\.\d+Z$/, "Z")}.json`);
  writeFileSync(file, JSON.stringify(record, null, 2) + "\n");

  console.log("\n" + formatSummary(record));
  console.log(`\nRecord written to ${path.relative(process.cwd(), file)}`);
}

main().catch((error) => fail(error instanceof Error ? (error.stack ?? error.message) : String(error)));
