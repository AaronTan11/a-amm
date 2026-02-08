/**
 * One-time agent registration on the ERC-8004 Identity Registry (Sepolia).
 *
 * Usage:
 *   SEPOLIA_RPC_URL=... AGENT_PRIVATE_KEY=0x... AGENT_NAME=Speedy AGENT_STRATEGY=speedy \
 *     bun run packages/agents/src/register.ts
 */

import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { registerAgent, IDENTITY_REGISTRY } from "./erc8004.ts";

const rpcUrl = process.env["SEPOLIA_RPC_URL"];
if (!rpcUrl) {
  console.error("SEPOLIA_RPC_URL is required");
  process.exit(1);
}

const privateKey = process.env["AGENT_PRIVATE_KEY"] as `0x${string}`;
if (!privateKey?.startsWith("0x")) {
  console.error("AGENT_PRIVATE_KEY is required (0x-prefixed)");
  process.exit(1);
}

const agentName = process.env["AGENT_NAME"];
if (!agentName) {
  console.error("AGENT_NAME is required (e.g., Speedy)");
  process.exit(1);
}

const agentStrategy = process.env["AGENT_STRATEGY"] ?? "speedy";

const account = privateKeyToAccount(privateKey);

console.log(`[register] Identity Registry: ${IDENTITY_REGISTRY}`);
console.log(`[register] Agent wallet:      ${account.address}`);
console.log(`[register] Name:              ${agentName}`);
console.log(`[register] Strategy:          ${agentStrategy}`);
console.log("");

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(rpcUrl),
});

const walletClient = createWalletClient({
  account,
  chain: sepolia,
  transport: http(rpcUrl),
});

async function main(): Promise<void> {
  console.log("[register] sending register() transaction...");

  const agentId = await registerAgent(walletClient, publicClient, agentName!, agentStrategy);

  console.log(`[register] SUCCESS — agent registered!`);
  console.log("");
  console.log(`  AGENT_ID=${agentId}`);
  console.log("");
  console.log(`  Add to your .env or pass as env var when running the agent/aggregator.`);
}

main().catch((err: unknown) => {
  console.error("[register] FAILED:", err);
  process.exit(1);
});
