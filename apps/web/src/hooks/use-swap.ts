import { useCallback } from "react";
import { encodeFunctionData, type Address } from "viem";
import {
  useAccount,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import { erc20Abi, HOOK_ADDRESS } from "@/lib/contracts";

// PoolSwapTest ABI — the router used to trigger swaps through the hook
const poolSwapTestAbi = [
  {
    type: "function",
    name: "swap",
    inputs: [
      {
        name: "key",
        type: "tuple",
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" },
        ],
      },
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "zeroForOne", type: "bool" },
          { name: "amountSpecified", type: "int256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
      {
        name: "testSettings",
        type: "tuple",
        components: [
          { name: "takeClaims", type: "bool" },
          { name: "settleUsingBurn", type: "bool" },
        ],
      },
      { name: "hookData", type: "bytes" },
    ],
    outputs: [{ name: "", type: "int256" }],
    stateMutability: "payable",
  },
] as const;

interface SwapParams {
  routerAddress: Address;
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  zeroForOne: boolean;
  amountIn: bigint;
  minOutputAmount: bigint;
}

export function useSwap() {
  const { address } = useAccount();
  const {
    writeContract,
    data: hash,
    isPending: isWritePending,
    error: writeError,
    reset,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } =
    useWaitForTransactionReceipt({ hash });

  const swap = useCallback(
    (params: SwapParams) => {
      if (!address) return;

      // sqrtPriceLimitX96 boundaries for max range
      const MIN_SQRT_PRICE_LIMIT = BigInt("4295128739") + 1n;
      const MAX_SQRT_PRICE_LIMIT =
        BigInt(
          "1461446703485210103287273052203988822378723970342",
        ) - 1n;

      // hookData = abi.encode(address swapper, uint256 minOutputAmount)
      const hookData = encodeFunctionData({
        abi: [
          {
            type: "function",
            name: "encode",
            inputs: [
              { name: "swapper", type: "address" },
              { name: "minOutputAmount", type: "uint256" },
            ],
            outputs: [],
            stateMutability: "pure",
          },
        ],
        functionName: "encode",
        args: [address, params.minOutputAmount],
      }).slice(10); // strip function selector, keep just encoded params
      const hookDataBytes = `0x${hookData}` as `0x${string}`;

      writeContract({
        address: params.routerAddress,
        abi: poolSwapTestAbi,
        functionName: "swap",
        args: [
          {
            currency0: params.currency0,
            currency1: params.currency1,
            fee: params.fee,
            tickSpacing: params.tickSpacing,
            hooks: HOOK_ADDRESS,
          },
          {
            zeroForOne: params.zeroForOne,
            amountSpecified: -params.amountIn, // negative = exact input
            sqrtPriceLimitX96: params.zeroForOne
              ? MIN_SQRT_PRICE_LIMIT
              : MAX_SQRT_PRICE_LIMIT,
          },
          {
            takeClaims: false,
            settleUsingBurn: false,
          },
          hookDataBytes,
        ],
      });
    },
    [address, writeContract],
  );

  return {
    swap,
    hash,
    isPending: isWritePending || isConfirming,
    isSuccess,
    error: writeError,
    reset,
  };
}

export function useApproveToken() {
  const {
    writeContract,
    data: hash,
    isPending,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } =
    useWaitForTransactionReceipt({ hash });

  const approve = useCallback(
    (tokenAddress: Address, spender: Address) => {
      writeContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [
          spender,
          BigInt(
            "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
          ),
        ],
      });
    },
    [writeContract],
  );

  return {
    approve,
    isPending: isPending || isConfirming,
    isSuccess,
  };
}
