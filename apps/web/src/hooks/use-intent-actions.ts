import { useCallback } from "react";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { HOOK_ADDRESS, aammHookAbi } from "@/lib/contracts";

export function useCancelIntent() {
  const {
    writeContract,
    data: hash,
    isPending: isWritePending,
    error: writeError,
    reset,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } =
    useWaitForTransactionReceipt({ hash });

  const cancel = useCallback(
    (intentId: bigint) => {
      writeContract({
        address: HOOK_ADDRESS,
        abi: aammHookAbi,
        functionName: "cancelIntent",
        args: [intentId],
      });
    },
    [writeContract],
  );

  return {
    cancel,
    isPending: isWritePending || isConfirming,
    isSuccess,
    error: writeError,
    reset,
  };
}

export function useFallbackToAMM() {
  const {
    writeContract,
    data: hash,
    isPending: isWritePending,
    error: writeError,
    reset,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } =
    useWaitForTransactionReceipt({ hash });

  const fallback = useCallback(
    (intentId: bigint) => {
      writeContract({
        address: HOOK_ADDRESS,
        abi: aammHookAbi,
        functionName: "fallbackToAMM",
        args: [intentId],
      });
    },
    [writeContract],
  );

  return {
    fallback,
    isPending: isWritePending || isConfirming,
    isSuccess,
    error: writeError,
    reset,
  };
}
