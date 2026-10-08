/**
 * Plain-text renderings of a run summary and a run comparison, for the
 * terminal and for copying into the README. Formatting only: every figure is
 * read from the record, none is computed here beyond scaling to percent.
 */

import type { RunComparison } from "@/lib/evals/compare";
import type { RateSummary, RunRecord } from "@/lib/evals/types";

const percent = (x: number | null) => (x === null ? "—" : `${(x * 100).toFixed(1)}%`);
const usd = (x: number | null) => (x === null ? "—" : `$${x.toFixed(4)}`);
const seconds = (ms: number | null) => (ms === null ? "—" : `${(ms / 1000).toFixed(1)} s`);

function rateRow(label: string, rate: RateSummary): string {
  const extras = [rate.errors > 0 ? `${rate.errors} error` : "", rate.skipped > 0 ? `${rate.skipped} skipped` : ""]
    .filter(Boolean)
    .join(", ");
  return `| ${label} | ${rate.passes}/${rate.completed} | ${percent(rate.rate)} | ${percent(rate.low)}–${percent(rate.high)} |${extras ? ` ${extras}` : ""}`;
}

/** A Markdown summary of a run: pass rates per area, then cost and latency per question. */
export function formatSummary(record: RunRecord): string {
  const { summary } = record;
  const lines = [
    `Run ${record.started_at} — ${record.model}, effort ${record.effort}, prompt ${record.prompt_hash.slice(0, 12)}`,
    `Status: ${record.status}${record.stopped_reason ? ` (${record.stopped_reason})` : ""}. ` +
      `Spent ${usd(record.spent_usd)} of a $${record.max_usd} cap.`,
    "",
    "| Area | Passed | Rate | 95% Wilson interval |",
    "|---|---|---|---|",
    ...Object.entries(summary.by_area).map(([area, rate]) => rateRow(area, rate)),
    rateRow("**overall**", summary.overall),
    "",
    `Cost per question (n=${summary.cost_per_question.n}): median ${usd(summary.cost_per_question.median)}, ` +
      `p95 ${usd(summary.cost_per_question.p95)}`,
    `Latency per question (n=${summary.latency_ms_per_question.n}): median ` +
      `${seconds(summary.latency_ms_per_question.median)}, p95 ${seconds(summary.latency_ms_per_question.p95)}`,
  ];

  const failed = record.cases.filter((c) => c.outcome === "fail" || c.outcome === "error");
  if (failed.length > 0) {
    lines.push("", "Not passing:");
    for (const c of failed) {
      const why =
        c.outcome === "error"
          ? `error: ${c.error}`
          : Object.entries(c.graders)
              .filter(([, result]) => !result.pass)
              .map(([name, result]) => `${name}: ${result.reasons.join("; ")}`)
              .join(" | ");
      lines.push(`- ${c.id} — ${why}`);
    }
  }
  return lines.join("\n");
}

/** A plain-text rendering of a comparison between two runs. */
export function formatComparison(comparison: RunComparison): string {
  const list = (ids: string[]) => (ids.length === 0 ? "none" : ids.join(", "));
  const lines = [
    `Compared: ${comparison.compared} cases completed in both runs`,
    `pass → fail: ${comparison.pass_to_fail.length} (${list(comparison.pass_to_fail)})`,
    `fail → pass: ${comparison.fail_to_pass.length} (${list(comparison.fail_to_pass)})`,
    `Unstable: ${list(comparison.unstable)}`,
  ];
  if (comparison.excluded.length > 0) {
    lines.push(`Excluded: ${comparison.excluded.map((e) => `${e.id} (${e.a} / ${e.b})`).join(", ")}`);
  }
  if (comparison.only_in_a.length > 0) lines.push(`Only in the first run: ${list(comparison.only_in_a)}`);
  if (comparison.only_in_b.length > 0) lines.push(`Only in the second run: ${list(comparison.only_in_b)}`);
  return lines.join("\n");
}
