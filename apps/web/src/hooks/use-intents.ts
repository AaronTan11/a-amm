import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";

import {
  HOOK_ADDRESS,
  IntentStatus,
  aammHookAbi,
  type IntentStatusType,
} from "@/lib/contracts";

export interface Intent {
  intentId: bigint;
  swapper: string;
  zeroForOne: boolean;
  amountSpecified: bigint;
  minOutputAmount: bigint;
  deadline: bigint;
  status: IntentStatusType;
  filledBy: string;
  outputAmount: bigint;
  poolKey: {
    currency0: string;
    currency1: string;
    fee: number;
    tickSpacing: number;
    hooks: string;
  };
}

export function useIntents() {
  const {
    data: nextId,
    isLoading: isLoadingCount,
    refetch: refetchCount,
  } = useReadContract({
    address: HOOK_ADDRESS,
    abi: aammHookAbi,
    functionName: "nextIntentId",
    query: {
      refetchInterval: 4000,
    },
  });

  const intentCount = nextId ? Number(nextId) : 0;

  const contracts = useMemo(
    () =>
      Array.from({ length: intentCount }, (_, i) => ({
        address: HOOK_ADDRESS,
        abi: aammHookAbi,
        functionName: "getIntent" as const,
        args: [BigInt(i)] as const,
      })),
    [intentCount],
  );

  const {
    data: rawIntents,
    isLoading: isLoadingIntents,
    refetch: refetchIntents,
  } = useReadContracts({
    contracts,
    query: {
      enabled: intentCount > 0,
      refetchInterval: 4000,
    },
  });

  const intents: Intent[] = useMemo(() => {
    if (!rawIntents) return [];
    return rawIntents
      .filter((r) => r.status === "success" && r.result)
      .map((r) => {
        const d = r.result as {
          intentId: bigint;
          swapper: string;
          poolKey: {
            currency0: string;
            currency1: string;
            fee: number;
            tickSpacing: number;
            hooks: string;
          };
          zeroForOne: boolean;
          amountSpecified: bigint;
          minOutputAmount: bigint;
          deadline: bigint;
          status: number;
          filledBy: string;
          outputAmount: bigint;
        };
        return {
          intentId: d.intentId,
          swapper: d.swapper,
          zeroForOne: d.zeroForOne,
          amountSpecified: d.amountSpecified,
          minOutputAmount: d.minOutputAmount,
          deadline: d.deadline,
          status: d.status as IntentStatusType,
          filledBy: d.filledBy,
          outputAmount: d.outputAmount,
          poolKey: d.poolKey,
        };
      });
  }, [rawIntents]);

  return {
    intents,
    intentCount,
    isLoading: isLoadingCount || isLoadingIntents,
    refetch: () => {
      refetchCount();
      refetchIntents();
    },
  };
}

export function statusLabel(status: IntentStatusType): string {
  switch (status) {
    case IntentStatus.Pending:
      return "PENDING";
    case IntentStatus.Filled:
      return "FILLED";
    case IntentStatus.Cancelled:
      return "CANCELLED";
    case IntentStatus.Expired:
      return "EXPIRED";
    default:
      return "UNKNOWN";
  }
}
