/**
 * One-time ENS subname registration for A-AMM agents on Sepolia.
 *
 * Prerequisites:
 *   - Owner must have registered aamm.eth on Sepolia ENS
 *   - Owner wallet must have Sepolia ETH for gas
 *
 * Usage:
 *   SEPOLIA_RPC_URL=... OWNER_PRIVATE_KEY=0x... \
 *     bun run packages/agents/src/register-ens.ts
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  namehash,
  parseAbi,
  toHex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

// Sepolia ENS contracts
const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e" as Address;
const PUBLIC_RESOLVER = "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5" as Address;

const registryAbi = parseAbi([
  "function setSubnodeOwner(bytes32 node, bytes32 label, address owner) returns (bytes32)",
  "function setResolver(bytes32 node, address resolver)",
  "function owner(bytes32 node) view returns (address)",
]);

const publicResolverAbi = parseAbi([
  "function setAddr(bytes32 node, address addr)",
]);

// Agent subnames to create
const AGENTS: { label: string; address: Address }[] = [
  { label: "speedy", address: "0xd94C17B860C4B0Ca8f76586803DdD07B976cA6A2" },
  { label: "cautious", address: "0x4210d287a6A28F96967c2424f162a0BCDd101694" },
  { label: "whale", address: "0x98cA02732d4646000b729292d36de6A853FF00cA" },
];

const PARENT_NAME = "aamm.eth";

// --- Env validation ---
const rpcUrl = process.env["SEPOLIA_RPC_URL"];
if (!rpcUrl) {
  console.error("SEPOLIA_RPC_URL is required");
  process.exit(1);
}

const privateKey = process.env["OWNER_PRIVATE_KEY"] as `0x${string}`;
if (!privateKey?.startsWith("0x")) {
  console.error("OWNER_PRIVATE_KEY is required (0x-prefixed, must own aamm.eth)");
  process.exit(1);
}

const account = privateKeyToAccount(privateKey);

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(rpcUrl),
});

const walletClient = createWalletClient({
  account,
  chain: sepolia,
  transport: http(rpcUrl),
});

function labelhash(label: string): `0x${string}` {
  return keccak256(toHex(label));
}

async function main(): Promise<void> {
  const parentNode = namehash(PARENT_NAME);
  console.log(`[ens] Parent: ${PARENT_NAME}`);
  console.log(`[ens] Parent node: ${parentNode}`);
  console.log(`[ens] Owner: ${account.address}`);
  console.log(`[ens] Registry: ${ENS_REGISTRY}`);
  console.log(`[ens] PublicResolver: ${PUBLIC_RESOLVER}`);
  console.log("");

  // Verify ownership
  const owner = await publicClient.readContract({
    address: ENS_REGISTRY,
    abi: registryAbi,
    functionName: "owner",
    args: [parentNode],
  });
  if (owner.toLowerCase() !== account.address.toLowerCase()) {
    console.error(`[ens] ERROR: ${account.address} does not own ${PARENT_NAME} (owner: ${owner})`);
    process.exit(1);
  }

  for (const agent of AGENTS) {
    const fullName = `${agent.label}.${PARENT_NAME}`;
    const subNode = namehash(fullName);
    const labelHash = labelhash(agent.label);

    console.log(`[ens] Creating ${fullName} → ${agent.address}`);

    // Step 1: Create subnode in Registry (owner = our wallet so we can set resolver)
    const createTx = await walletClient.writeContract({
      address: ENS_REGISTRY,
      abi: registryAbi,
      functionName: "setSubnodeOwner",
      args: [parentNode, labelHash, account.address],
    });
    await publicClient.waitForTransactionReceipt({ hash: createTx });
    console.log(`[ens]   subnode created: ${createTx}`);

    // Step 2: Set resolver on the subnode
    const resolverTx = await walletClient.writeContract({
      address: ENS_REGISTRY,
      abi: registryAbi,
      functionName: "setResolver",
      args: [subNode, PUBLIC_RESOLVER],
    });
    await publicClient.waitForTransactionReceipt({ hash: resolverTx });
    console.log(`[ens]   resolver set: ${resolverTx}`);

    // Step 3: Set address record on PublicResolver
    const addrTx = await walletClient.writeContract({
      address: PUBLIC_RESOLVER,
      abi: publicResolverAbi,
      functionName: "setAddr",
      args: [subNode, agent.address],
    });
    await publicClient.waitForTransactionReceipt({ hash: addrTx });
    console.log(`[ens]   addr record set: ${addrTx}`);

    console.log(`[ens]   ${fullName} done`);
    console.log("");
  }

  console.log("[ens] All subnames created successfully!");
  console.log("");
  console.log("Subnames:");
  for (const agent of AGENTS) {
    console.log(`  ${agent.label}.${PARENT_NAME} → ${agent.address}`);
  }
}

main().catch((err: unknown) => {
  console.error("[ens] FAILED:", err);
  process.exit(1);
});
