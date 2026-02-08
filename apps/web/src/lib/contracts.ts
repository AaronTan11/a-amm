import { type Address, parseAbi } from "viem";

export const HOOK_ADDRESS = (import.meta.env["VITE_HOOK_ADDRESS"] ??
  "0x0000000000000000000000000000000000000000") as Address;

export const aammHookAbi = parseAbi([
  // Events
  "event IntentCreated(uint256 indexed intentId, address indexed swapper, bytes32 indexed poolId, bool zeroForOne, uint256 amountIn, uint256 minOutputAmount, uint256 deadline)",
  "event IntentFilled(uint256 indexed intentId, address indexed agent, uint256 outputAmount)",
  "event IntentCancelled(uint256 indexed intentId)",
  "event IntentFallback(uint256 indexed intentId)",

  // Read functions
  "function getIntent(uint256 intentId) view returns ((uint256 intentId, address swapper, (address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, int256 amountSpecified, uint256 minOutputAmount, uint256 deadline, uint8 status, address filledBy, uint256 outputAmount))",
  "function nextIntentId() view returns (uint256)",
  "function DEFAULT_DEADLINE_BLOCKS() view returns (uint256)",

  // Write functions
  "function fill(uint256 intentId, uint256 outputAmount)",
  "function fallbackToAMM(uint256 intentId)",
  "function cancelIntent(uint256 intentId)",
]);

export const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

export const IntentStatus = {
  Pending: 0,
  Filled: 1,
  Cancelled: 2,
  Expired: 3,
} as const;

export type IntentStatusType =
  (typeof IntentStatus)[keyof typeof IntentStatus];
