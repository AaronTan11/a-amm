import { useMemo } from "react";

import { IntentStatus } from "@/lib/contracts";

import type { Intent } from "./use-intents";

export interface AgentStat {
  address: string;
  fillCount: number;
  totalOutput: bigint;
}

export function useAgentStats(intents: Intent[]) {
  const agents = useMemo(() => {
    const map = new Map<string, { count: number; total: bigint }>();

    for (const intent of intents) {
      if (intent.status !== IntentStatus.Filled) continue;
      const agent = intent.filledBy;
      const existing = map.get(agent) ?? { count: 0, total: 0n };
      map.set(agent, {
        count: existing.count + 1,
        total: existing.total + intent.outputAmount,
      });
    }

    return Array.from(map.entries())
      .map(([address, stats]) => ({
        address,
        fillCount: stats.count,
        totalOutput: stats.total,
      }))
      .sort((a, b) => b.fillCount - a.fillCount);
  }, [intents]);

  return { agents };
}
