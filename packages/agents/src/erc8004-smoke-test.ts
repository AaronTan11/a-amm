/**
 * ERC-8004 smoke test — register agent, submit feedback, query reputation.
 * Runs against live Sepolia contracts.
 *
 * Usage:
 *   SEPOLIA_RPC_URL=... PRIVATE_KEY=0x... bun run packages/agents/src/erc8004-smoke-test.ts
 */

import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import {
  registerAgent,
  submitFeedback,
  getReputation,
  getAgentName,
  IDENTITY_REGISTRY,
  REPUTATION_REGISTRY,
} from "./erc8004.ts";

const rpcUrl = process.env["SEPOLIA_RPC_URL"];
if (!rpcUrl) {
  console.error("SEPOLIA_RPC_URL is required");
  process.exit(1);
}

const privateKey = process.env["PRIVATE_KEY"] as `0x${string}`;
if (!privateKey?.startsWith("0x")) {
  console.error("PRIVATE_KEY is required (0x-prefixed, must have Sepolia ETH for gas)");
  process.exit(1);
}

const account = privateKeyToAccount(privateKey);
console.log(`[erc8004-smoke] wallet: ${account.address}`);
console.log(`[erc8004-smoke] Identity Registry: ${IDENTITY_REGISTRY}`);
console.log(`[erc8004-smoke] Reputation Registry: ${REPUTATION_REGISTRY}`);
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

function step(name: string): void {
  process.stdout.write(`[erc8004-smoke] ${name}... `);
}

function ok(detail?: string): void {
  console.log(`OK${detail ? ` (${detail})` : ""}`);
}

function fail(reason: string): never {
  console.log(`FAIL — ${reason}`);
  process.exit(1);
}

async function main(): Promise<void> {
  // Step 1: Register a test agent
  step("registering test agent");
  let agentId: bigint;
  try {
    agentId = await registerAgent(walletClient, publicClient, "SmokeTestAgent", "test");
    ok(`agentId=${agentId}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(`register failed: ${msg}`);
  }

  // Step 2: Query agent name
  step("querying agent name");
  const name = await getAgentName(publicClient, agentId);
  if (name === "SmokeTestAgent") {
    ok(`name="${name}"`);
  } else {
    fail(`expected "SmokeTestAgent", got "${name}"`);
  }

  // Step 3: Submit feedback
  step("submitting feedback (score=85)");
  try {
    await submitFeedback(walletClient, publicClient, agentId, 85);
    ok();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(`feedback failed: ${msg}`);
  }

  // Step 4: Query reputation
  step("querying reputation summary");
  const rep = await getReputation(publicClient, agentId);
  if (rep.count >= 1 && rep.score === 85) {
    ok(`count=${rep.count}, score=${rep.score}`);
  } else {
    fail(`expected count>=1 & score=85, got count=${rep.count} score=${rep.score}`);
  }

  console.log(`\n[erc8004-smoke] ALL PASSED — agentId=${agentId}`);
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error("\n[erc8004-smoke] FAILED:", err);
  process.exit(1);
});
