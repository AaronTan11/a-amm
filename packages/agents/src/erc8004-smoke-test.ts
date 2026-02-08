/**
 * ERC-8004 smoke test — register agent, submit feedback, query reputation.
 * Runs against live Sepolia contracts.
 *
 * Usage:
 *   SEPOLIA_RPC_URL=... PRIVATE_KEY=0x... bun run packages/agents/src/erc8004-smoke-test.ts
 *
 * Note: The Reputation Registry forbids self-feedback (owner can't rate their own agent).
 * This test registers an agent, then gives feedback to a DIFFERENT agent to prove the
 * feedback mechanism works. Both registration and feedback require gas.
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

// Optional: skip registration if you already have an agentId
const skipRegister = process.env["SKIP_REGISTER"] === "1";
const existingAgentId = process.env["AGENT_ID"] ? BigInt(process.env["AGENT_ID"]) : undefined;

// To test feedback, we need an agent NOT owned by this wallet.
// Pass FEEDBACK_AGENT_ID to give feedback to a specific agent.
const feedbackAgentId = process.env["FEEDBACK_AGENT_ID"]
  ? BigInt(process.env["FEEDBACK_AGENT_ID"])
  : undefined;

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
  // Step 1: Register a test agent (or use existing)
  let agentId: bigint;
  if (skipRegister && existingAgentId) {
    agentId = existingAgentId;
    console.log(`[erc8004-smoke] skipping registration, using agentId=${agentId}`);
  } else {
    step("registering test agent (1 tx)");
    try {
      agentId = await registerAgent(walletClient, publicClient, "SmokeTestAgent", "test");
      ok(`agentId=${agentId}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      fail(`register failed: ${msg}`);
    }
  }

  // Step 2: Query agent name
  step("querying agent name (read-only)");
  const name = await getAgentName(publicClient, agentId);
  if (name === "SmokeTestAgent") {
    ok(`name="${name}"`);
  } else if (name) {
    ok(`name="${name}" (different from expected, but query works)`);
  } else {
    fail(`got null — metadata not stored correctly`);
  }

  // Step 3: Submit feedback to a DIFFERENT agent (self-feedback is forbidden)
  if (feedbackAgentId) {
    step(`submitting feedback to agent #${feedbackAgentId} (1 tx)`);
    try {
      await submitFeedback(walletClient, publicClient, feedbackAgentId, 85);
      ok();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      fail(`feedback failed: ${msg}`);
    }

    // Step 4: Query reputation for the agent we gave feedback to
    step("querying reputation summary (read-only)");
    const rep = await getReputation(publicClient, feedbackAgentId, [account.address]);
    if (rep.count >= 1) {
      ok(`count=${rep.count}, score=${rep.score}`);
    } else {
      fail(`expected count>=1, got count=${rep.count} score=${rep.score}`);
    }
  } else {
    console.log(`[erc8004-smoke] skipping feedback test (no FEEDBACK_AGENT_ID set)`);
    console.log(`[erc8004-smoke]   to test: FEEDBACK_AGENT_ID=<id of agent NOT owned by this wallet>`);
  }

  // Step 5: Query reputation for our own agent (should have 0 feedback initially)
  step("querying own agent reputation (read-only)");
  const ownRep = await getReputation(publicClient, agentId, [account.address]);
  ok(`count=${ownRep.count}, score=${ownRep.score}`);

  console.log(`\n[erc8004-smoke] ALL PASSED — agentId=${agentId}`);
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error("\n[erc8004-smoke] FAILED:", err);
  process.exit(1);
});
