"use client";

/**
 * The per-NAP optical budget breakdown, as an overlay card on the map (see
 * design.md, decision 5). Every figure it shows is `formatBreakdown`'s
 * output verbatim — see spec.md, "Clicking a NAP shows its optical budget":
 * the browser only displays these figures, it does not compute them.
 */

import { STATUS_COLOR } from "@/lib/map/config";
import type { FormattedBreakdown } from "@/lib/map/breakdown";

export interface BudgetBreakdownProps {
  breakdown: FormattedBreakdown;
  onClose: () => void;
}

const STATUS_LABEL: Record<FormattedBreakdown["status"], string> = {
  pass: "Pass",
  marginal: "Marginal",
  fail: "Fail",
};

export default function BudgetBreakdown({ breakdown, onClose }: BudgetBreakdownProps) {
  return (
    <div className="absolute top-3 right-3 w-80 max-w-[calc(100vw-1.5rem)] space-y-3 rounded border border-zinc-200 bg-white p-4 text-sm text-black shadow-lg dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{breakdown.nap_id}</p>
          <p className="text-xs text-zinc-500">{breakdown.nap_name}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded px-1.5 py-0.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          ✕
        </button>
      </div>

      <span
        className="inline-block rounded px-2 py-0.5 text-xs font-medium text-white"
        style={{ backgroundColor: STATUS_COLOR[breakdown.status] }}
      >
        {STATUS_LABEL[breakdown.status]}
      </span>

      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-zinc-500">
            <th className="font-normal">Hop</th>
            <th className="font-normal">Fiber</th>
            <th className="font-normal">Splitter</th>
            <th className="font-normal">Conn.</th>
            <th className="font-normal">Splices</th>
          </tr>
        </thead>
        <tbody>
          {breakdown.hops.map((hop) => (
            <tr key={hop.run_id} className="border-t border-zinc-100 dark:border-zinc-800">
              <td className="py-1">
                {hop.run_id} ({hop.length_km} km)
              </td>
              <td>{hop.fiber_db} dB</td>
              <td>
                {hop.splitter_ratio} ({hop.splitter_db} dB)
              </td>
              <td>
                {hop.connectors} × ({hop.connectors_db} dB)
              </td>
              <td>
                {hop.splices} × ({hop.splices_db} dB)
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="grid grid-cols-2 gap-x-2 gap-y-1 border-t border-zinc-100 pt-2 text-xs dark:border-zinc-800">
        <dt className="text-zinc-500">Fiber</dt>
        <dd className="text-right">{breakdown.by_source.fiber_db} dB</dd>
        <dt className="text-zinc-500">Splitters</dt>
        <dd className="text-right">{breakdown.by_source.splitters_db} dB</dd>
        <dt className="text-zinc-500">Connectors</dt>
        <dd className="text-right">{breakdown.by_source.connectors_db} dB</dd>
        <dt className="text-zinc-500">Splices</dt>
        <dd className="text-right">{breakdown.by_source.splices_db} dB</dd>
      </dl>

      <dl className="grid grid-cols-2 gap-x-2 gap-y-1 border-t border-zinc-100 pt-2 text-sm font-medium dark:border-zinc-800">
        <dt>Total attenuation</dt>
        <dd className="text-right">{breakdown.total_loss_db} dB</dd>
        <dt>Budget</dt>
        <dd className="text-right">{breakdown.budget_db} dB</dd>
        <dt>Margin</dt>
        <dd className="text-right">{breakdown.margin_db} dB</dd>
      </dl>
    </div>
  );
}
