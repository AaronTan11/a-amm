/**
 * One-time setup script for Yellow Network integration.
 *
 * This script:
 * 1. Connects to ClearNode sandbox as the aggregator
 * 2. Authenticates via EIP-712
 * 3. Creates an app session for quote coordination
 *
 * The resulting APP_SESSION_ID should be shared with agents via env var.
 *
 * Usage:
 *   HOOK_ADDRESS=0x... bun run packages/aggregator/src/setup.ts
 */

import { loadConfig } from "./config.ts";
import { YellowConnection } from "./yellow.ts";
import type { Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Agent private keys — read from env vars
const SPEEDY_KEY = process.env["SPEEDY_PRIVATE_KEY"] as `0x${string}` | undefined;
const CAUTIOUS_KEY = process.env["CAUTIOUS_PRIVATE_KEY"] as `0x${string}` | undefined;
const WHALE_KEY = process.env["WHALE_PRIVATE_KEY"] as `0x${string}` | undefined;

if (!SPEEDY_KEY || !CAUTIOUS_KEY || !WHALE_KEY) {
  console.error("Missing agent keys. Set SPEEDY_PRIVATE_KEY, CAUTIOUS_PRIVATE_KEY, WHALE_PRIVATE_KEY env vars.");
  process.exit(1);
}

const AGENT_KEYS = {
  speedy:   SPEEDY_KEY,
  cautious: CAUTIOUS_KEY,
  whale:    WHALE_KEY,
} as const;

async function main(): Promise<void> {
  console.log("=== A-AMM Yellow Network Setup ===\n");

  const config = loadConfig();

  // Derive agent addresses from their private keys
  const agentAddresses: Address[] = Object.entries(AGENT_KEYS).map(
    ([name, key]) => {
      const addr = privateKeyToAccount(key as `0x${string}`).address;
      console.log(`  Agent ${name}: ${addr}`);
      return addr;
    },
  );

  const yellow = new YellowConnection(config.aggregatorPrivateKey, config.clearNodeUrl);

  console.log(`\n  Aggregator: ${yellow.address}`);
  console.log(`  ClearNode:  ${config.clearNodeUrl}\n`);

  // Step 1: Connect and authenticate
  console.log("[setup] connecting to ClearNode...");
  await yellow.connect();

  // Step 2: Create app session with aggregator + all agents
  const allParticipants: Address[] = [yellow.address, ...agentAddresses];
  console.log(`[setup] creating app session with ${allParticipants.length} participants...`);

  const allocations = allParticipants.map((addr) => ({
    asset: "usdc",
    amount: "0",
    participant: addr,
  }));

  const appSessionId = await yellow.createAppSession(allParticipants, allocations);

  console.log("\n=== Setup Complete ===");
  console.log(`APP_SESSION_ID=${appSessionId}`);
  console.log("\nShare this with agents:");
  console.log(`  APP_SESSION_ID=${appSessionId} AGENT_STRATEGY=speedy AGENT_PRIVATE_KEY=${AGENT_KEYS.speedy} HOOK_ADDRESS=${config.hookAddress} bun run packages/agents/src/run.ts`);
  console.log(`  APP_SESSION_ID=${appSessionId} AGENT_STRATEGY=cautious AGENT_PRIVATE_KEY=${AGENT_KEYS.cautious} HOOK_ADDRESS=${config.hookAddress} bun run packages/agents/src/run.ts`);
  console.log(`  APP_SESSION_ID=${appSessionId} AGENT_STRATEGY=whale AGENT_PRIVATE_KEY=${AGENT_KEYS.whale} HOOK_ADDRESS=${config.hookAddress} bun run packages/agents/src/run.ts`);

  yellow.disconnect();
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
