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

// --- ERC-8004 Registries (Sepolia) ---

export const IDENTITY_REGISTRY: Address =
  "0x8004A818BFB912233c491871b3d84c89A494BD9e";
export const REPUTATION_REGISTRY: Address =
  "0x8004B663056A597Dffe9eCcC1965A193B7388713";

export const identityRegistryAbi = parseAbi([
  "function getMetadata(uint256 agentId, string metadataKey) view returns (bytes)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function balanceOf(address owner) view returns (uint256)",
]);

export const reputationRegistryAbi = parseAbi([
  "function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)",
]);
