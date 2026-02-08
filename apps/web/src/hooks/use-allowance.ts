import { type Address } from "viem";
import { useAccount, useReadContract } from "wagmi";

import { erc20Abi } from "@/lib/contracts";

export function useAllowance(
  tokenAddress: Address | undefined,
  spender: Address,
) {
  const { address } = useAccount();

  const {
    data: allowance,
    isLoading,
    refetch,
  } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address!, spender],
    query: {
      enabled: !!address && !!tokenAddress,
    },
  });

  const isApproved = (amount: bigint): boolean => {
    return allowance !== undefined && allowance >= amount;
  };

  return { allowance, isApproved, isLoading, refetch };
}
