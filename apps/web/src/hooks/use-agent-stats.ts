import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { decodeAbiParameters, parseAbiParameters } from "viem";

import {
  IntentStatus,
  REPUTATION_REGISTRY,
  IDENTITY_REGISTRY,
  reputationRegistryAbi,
  identityRegistryAbi,
} from "@/lib/contracts";

import type { Intent } from "./use-intents";

export interface AgentStat {
  address: string;
  fillCount: number;
  totalOutput: bigint;
  name?: string;
  reputationScore?: number;
  reputationCount?: number;
  agentId?: bigint;
}

// Hardcoded agent address → ERC-8004 agentId mapping.
// Populated after running the registration script on Sepolia.
// TODO: Replace with dynamic lookup or env-driven config.
const AGENT_ID_MAP: Record<string, bigint> = {
  // Example: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8": 1n,
};

export function useAgentStats(intents: Intent[]) {
  // Step 1: Aggregate fill stats from intents
  const baseAgents = useMemo(() => {
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
        agentId: AGENT_ID_MAP[address.toLowerCase()],
      }))
      .sort((a, b) => b.fillCount - a.fillCount);
  }, [intents]);

  // Step 2: Build multicall for ERC-8004 queries (reputation + name)
  const contracts = useMemo(() => {
    const calls: {
      address: `0x${string}`;
      abi: typeof reputationRegistryAbi | typeof identityRegistryAbi;
      functionName: string;
      args: unknown[];
    }[] = [];

    for (const agent of baseAgents) {
      if (!agent.agentId) continue;

      // getSummary for reputation
      calls.push({
        address: REPUTATION_REGISTRY,
        abi: reputationRegistryAbi,
        functionName: "getSummary",
        args: [agent.agentId, [], "starred", "swap"],
      });

      // getMetadata for name
      calls.push({
        address: IDENTITY_REGISTRY,
        abi: identityRegistryAbi,
        functionName: "getMetadata",
        args: [agent.agentId, "name"],
      });
    }

    return calls;
  }, [baseAgents]);

  const { data: multicallResults } = useReadContracts({
    contracts: contracts as any,
    query: { enabled: contracts.length > 0 },
  });

  // Step 3: Merge reputation data into agent stats
  const agents = useMemo(() => {
    if (!multicallResults || contracts.length === 0) return baseAgents;

    let resultIdx = 0;
    return baseAgents.map((agent) => {
      if (!agent.agentId) return agent;

      const summaryResult = multicallResults[resultIdx];
      const nameResult = multicallResults[resultIdx + 1];
      resultIdx += 2;

      let reputationScore: number | undefined;
      let reputationCount: number | undefined;
      let name: string | undefined;

      // Parse reputation summary
      if (summaryResult?.status === "success" && Array.isArray(summaryResult.result)) {
        const [count, value] = summaryResult.result as [bigint, bigint, number];
        reputationCount = Number(count);
        reputationScore = Number(value);
      }

      // Parse name metadata
      if (nameResult?.status === "success" && nameResult.result) {
        try {
          const raw = nameResult.result as `0x${string}`;
          if (raw !== "0x" && raw.length > 2) {
            const [decoded] = decodeAbiParameters(parseAbiParameters("string"), raw);
            name = decoded;
          }
        } catch {
          // ignore decode errors
        }
      }

      return { ...agent, name, reputationScore, reputationCount };
    });
  }, [baseAgents, multicallResults, contracts.length]);

  return { agents };
}
