import {
  parseAbi,
  decodeEventLog,
  type Address,
  type PublicClient,
  type WalletClient,
  type Account,
  type Chain,
  type Transport,
  encodeAbiParameters,
  parseAbiParameters,
  decodeAbiParameters,
  zeroHash,
} from "viem";

type WriteableWalletClient = WalletClient<Transport, Chain, Account>;

// --- Contract addresses (Sepolia) ---

export const IDENTITY_REGISTRY: Address = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
export const REPUTATION_REGISTRY: Address = "0x8004B663056A597Dffe9eCcC1965A193B7388713";

// --- ABIs ---

export const identityRegistryAbi = parseAbi([
  // Registration
  "function register() returns (uint256 agentId)",
  "function register(string agentURI) returns (uint256 agentId)",
  "function register(string agentURI, (string metadataKey, bytes metadataValue)[] metadata) returns (uint256 agentId)",

  // Metadata
  "function setMetadata(uint256 agentId, string metadataKey, bytes metadataValue)",
  "function getMetadata(uint256 agentId, string metadataKey) view returns (bytes)",

  // ERC-721 basics
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)",

  // Events
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
]);

export const reputationRegistryAbi = parseAbi([
  // Feedback
  "function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)",

  // Queries
  "function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)",
  "function getLastIndex(uint256 agentId, address clientAddress) view returns (uint64)",
  "function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex) view returns (int128 value, uint8 valueDecimals, string tag1, string tag2, bool isRevoked)",

  // Events
  "event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed tag1, string tag1Unindexed, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)",
]);

// --- Reputation tags ---

export const REPUTATION_TAG1 = "starred";
export const REPUTATION_TAG2 = "swap";

// --- Helper functions ---

/** Register a new agent on the Identity Registry with name + strategy metadata */
export async function registerAgent(
  walletClient: WriteableWalletClient,
  publicClient: PublicClient,
  name: string,
  strategy: string,
): Promise<bigint> {
  const metadata = [
    {
      metadataKey: "name",
      metadataValue: encodeAbiParameters(parseAbiParameters("string"), [name]),
    },
    {
      metadataKey: "strategy",
      metadataValue: encodeAbiParameters(parseAbiParameters("string"), [strategy]),
    },
  ];

  const hash = await walletClient.writeContract({
    address: IDENTITY_REGISTRY,
    abi: identityRegistryAbi,
    functionName: "register",
    args: ["", metadata],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  // Extract agentId from the Registered event (not the ERC-721 Transfer event)
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== IDENTITY_REGISTRY.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: identityRegistryAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "Registered") {
        return (decoded.args as { agentId: bigint }).agentId;
      }
    } catch {
      // Not a Registered event, skip
    }
  }

  throw new Error("Could not find Registered event in transaction receipt");
}

/** Submit reputation feedback for an agent */
export async function submitFeedback(
  walletClient: WriteableWalletClient,
  publicClient: PublicClient,
  agentId: bigint,
  score: number,
): Promise<void> {
  const hash = await walletClient.writeContract({
    address: REPUTATION_REGISTRY,
    abi: reputationRegistryAbi,
    functionName: "giveFeedback",
    args: [
      agentId,
      BigInt(Math.min(100, Math.max(0, Math.round(score)))),
      0,             // valueDecimals
      REPUTATION_TAG1,
      REPUTATION_TAG2,
      "",            // endpoint
      "",            // feedbackURI (on-chain only)
      zeroHash,      // feedbackHash
    ],
  });

  await publicClient.waitForTransactionReceipt({ hash });
}

/** Query reputation summary for an agent. clientAddresses is required (non-empty). */
export async function getReputation(
  publicClient: PublicClient,
  agentId: bigint,
  clientAddresses: Address[],
): Promise<{ count: number; score: number }> {
  const [count, summaryValue] = await publicClient.readContract({
    address: REPUTATION_REGISTRY,
    abi: reputationRegistryAbi,
    functionName: "getSummary",
    args: [agentId, clientAddresses, REPUTATION_TAG1, REPUTATION_TAG2],
  });

  return {
    count: Number(count),
    score: Number(summaryValue),
  };
}

/** Query agent metadata (name) from the Identity Registry */
export async function getAgentName(
  publicClient: PublicClient,
  agentId: bigint,
): Promise<string | null> {
  try {
    const raw = await publicClient.readContract({
      address: IDENTITY_REGISTRY,
      abi: identityRegistryAbi,
      functionName: "getMetadata",
      args: [agentId, "name"],
    });

    if (raw === "0x" || raw.length <= 2) return null;
    const [name] = decodeAbiParameters(parseAbiParameters("string"), raw);
    return name;
  } catch {
    return null;
  }
}
