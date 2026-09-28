/**
 * The map copilot's page. A server component: it loads the network and
 * computes every NAP's budget once, server-side, and hands both down as
 * props — see design.md, decision 1. `loadNetwork` uses `node:fs` and must
 * stay out of any "use client" file; `Copilot` (client) is the only thing
 * that touches the browser-only pieces (MapLibre, the chat's SSE reading).
 */

import Copilot from "@/components/Copilot";
import { loadNetwork } from "@/lib/network/load";
import { calculateAllBudgets } from "@/lib/optical/budget";

export default function Page() {
  const network = loadNetwork();
  const budgets = calculateAllBudgets(network);

  return <Copilot network={network} budgets={budgets} />;
}
