import { formatUnits, type Address } from "viem";
import { useAccount, useReadContract } from "wagmi";

import { erc20Abi } from "@/lib/contracts";

export function useTokenBalance(
  tokenAddress: Address | undefined,
  decimals: number,
) {
  const { address } = useAccount();

  const {
    data: balance,
    isLoading,
    refetch,
  } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address!],
    query: {
      enabled: !!address && !!tokenAddress,
      refetchInterval: 30_000,
    },
  });

  const formatted =
    balance !== undefined ? formatUnits(balance, decimals) : "0";

  return { balance, formatted, isLoading, refetch };
}
