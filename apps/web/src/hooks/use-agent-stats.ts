import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { decodeAbiParameters, parseAbiParameters, type Address } from "viem";

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
  ensName?: string;
  reputationScore?: number;
  reputationCount?: number;
  agentId?: bigint;
}

// Hardcoded agent address → ERC-8004 agentId mapping.
// Populated after running the registration script on Sepolia.
// TODO: Replace with dynamic lookup or env-driven config.
const AGENT_ID_MAP: Record<string, bigint> = {
  "0xd94c17b860c4b0ca8f76586803ddd07b976ca6a2": 990n, // Speedy
  "0x4210d287a6a28f96967c2424f162a0bcdd101694": 991n, // Cautious
  "0x98ca02732d4646000b729292d36de6a853ff00ca": 992n, // Whale
};

const ENS_NAME_MAP: Record<string, string> = {
  "0xd94c17b860c4b0ca8f76586803ddd07b976ca6a2": "speedy.aamm.eth",
  "0x4210d287a6a28f96967c2424f162a0bcdd101694": "cautious.aamm.eth",
  "0x98ca02732d4646000b729292d36de6a853ff00ca": "whale.aamm.eth",
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
        ensName: ENS_NAME_MAP[address.toLowerCase()],
      }))
      .sort((a, b) => b.fillCount - a.fillCount);
  }, [intents]);

  // Step 2a: Fetch client addresses for each known agent (needed by getSummary)
  const clientCalls = useMemo(() => {
    return baseAgents
      .filter((a) => a.agentId != null)
      .map((a) => ({
        address: REPUTATION_REGISTRY,
        abi: reputationRegistryAbi,
        functionName: "getClients" as const,
        args: [a.agentId!],
      }));
  }, [baseAgents]);

  const { data: clientResults } = useReadContracts({
    contracts: clientCalls as any,
    query: { enabled: clientCalls.length > 0 },
  });

  // Step 2b: Build multicall for reputation + name queries using client addresses
  const contracts = useMemo(() => {
    const calls: {
      address: `0x${string}`;
      abi: typeof reputationRegistryAbi | typeof identityRegistryAbi;
      functionName: string;
      args: unknown[];
    }[] = [];

    let clientIdx = 0;
    for (const agent of baseAgents) {
      if (!agent.agentId) continue;

      // Get client addresses from phase 1 results
      let clients: Address[] = [];
      if (clientResults?.[clientIdx]?.status === "success") {
        clients = clientResults[clientIdx].result as Address[];
      }
      clientIdx++;

      // Skip getSummary if no clients (would revert)
      if (clients.length > 0) {
        calls.push({
          address: REPUTATION_REGISTRY,
          abi: reputationRegistryAbi,
          functionName: "getSummary",
          args: [agent.agentId, clients, "starred", "swap"],
        });
      }

      // getMetadata for name (always works)
      calls.push({
        address: IDENTITY_REGISTRY,
        abi: identityRegistryAbi,
        functionName: "getMetadata",
        args: [agent.agentId, "name"],
      });
    }

    return calls;
  }, [baseAgents, clientResults]);

  const { data: multicallResults } = useReadContracts({
    contracts: contracts as any,
    query: { enabled: contracts.length > 0 },
  });

  // Step 3: Merge reputation data into agent stats
  const agents = useMemo(() => {
    if (!multicallResults || contracts.length === 0) return baseAgents;

    let resultIdx = 0;
    let clientIdx = 0;
    return baseAgents.map((agent) => {
      if (!agent.agentId) return agent;

      // Determine if this agent had clients (and thus a getSummary call)
      let hasClients = false;
      if (clientResults?.[clientIdx]?.status === "success") {
        const clients = clientResults[clientIdx].result as Address[];
        hasClients = clients.length > 0;
      }
      clientIdx++;

      let reputationScore: number | undefined;
      let reputationCount: number | undefined;
      let name: string | undefined;

      // Parse reputation summary (only present if agent had clients)
      if (hasClients) {
        const summaryResult = multicallResults[resultIdx];
        if (summaryResult?.status === "success" && Array.isArray(summaryResult.result)) {
          const [count, value] = summaryResult.result as [bigint, bigint, number];
          reputationCount = Number(count);
          reputationScore = Number(value);
        }
        resultIdx++;
      }

      // Parse name metadata
      const nameResult = multicallResults[resultIdx];
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
      resultIdx++;

      return { ...agent, name, reputationScore, reputationCount };
    });
  }, [baseAgents, multicallResults, clientResults, contracts.length]);

  return { agents };
}
