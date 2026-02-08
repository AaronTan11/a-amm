import {
  createPublicClient,
  createWalletClient,
  http,
  maxUint256,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { aammHookAbi, erc20Abi, IntentStatus } from "./abi.ts";
import type { AgentConfig } from "./config.ts";

interface IntentCreatedArgs {
  intentId?: bigint;
  swapper?: Address;
  poolId?: `0x${string}`;
  zeroForOne?: boolean;
  amountIn?: bigint;
  minOutputAmount?: bigint;
  deadline?: bigint;
}

export async function startAgent(config: AgentConfig): Promise<void> {
  const account = privateKeyToAccount(config.agentPrivateKey);

  const publicClient = createPublicClient({
    chain: foundry,
    transport: http(config.rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: foundry,
    transport: http(config.rpcUrl),
  });

  const agentAddress = account.address;
  const blockNumber = await publicClient.getBlockNumber();

  console.log(`[Agent] Address: ${agentAddress}`);
  console.log(`[Agent] Connected — block #${blockNumber}`);
  console.log(`[Agent] Watching for intents...\n`);

  // Track which tokens we've already approved
  const approvedTokens = new Set<Address>();

  async function handleIntent(args: IntentCreatedArgs): Promise<void> {
    const { intentId, amountIn, minOutputAmount, deadline } = args;

    if (
      intentId === undefined ||
      amountIn === undefined ||
      minOutputAmount === undefined ||
      deadline === undefined
    ) {
      console.log(`[Intent] Skipping — missing event args`);
      return;
    }

    console.log(
      `[Intent #${intentId}] New intent: amountIn=${amountIn} minOutput=${minOutputAmount} deadline=block#${deadline}`,
    );

    // Check if deadline has passed
    const currentBlock = await publicClient.getBlockNumber();
    if (currentBlock > deadline) {
      console.log(`[Intent #${intentId}] Deadline passed, skipping`);
      return;
    }

    // Read full intent to verify status
    const intent = await publicClient.readContract({
      address: config.hookAddress,
      abi: aammHookAbi,
      functionName: "getIntent",
      args: [intentId],
    });

    if (intent.status !== IntentStatus.Pending) {
      console.log(`[Intent #${intentId}] Not pending (status=${intent.status}), skipping`);
      return;
    }

    // Compute quote: 5% spread (agent keeps 5% as profit)
    const baseQuote = (amountIn * 95n) / 100n;
    const outputAmount =
      baseQuote > minOutputAmount ? baseQuote : minOutputAmount;

    // Determine output token
    const outputToken: Address = intent.zeroForOne
      ? intent.poolKey.currency1
      : intent.poolKey.currency0;

    // Check agent's balance
    const balance = await publicClient.readContract({
      address: outputToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [agentAddress],
    });

    if (balance < outputAmount) {
      console.log(
        `[Intent #${intentId}] Insufficient balance: have ${balance}, need ${outputAmount}`,
      );
      return;
    }

    // Approve hook if needed (once per token)
    if (!approvedTokens.has(outputToken)) {
      const allowance = await publicClient.readContract({
        address: outputToken,
        abi: erc20Abi,
        functionName: "allowance",
        args: [agentAddress, config.hookAddress],
      });

      if (allowance < outputAmount) {
        console.log(`[Intent #${intentId}] Approving hook for output token...`);
        const approveTx = await walletClient.writeContract({
          address: outputToken,
          abi: erc20Abi,
          functionName: "approve",
          args: [config.hookAddress, maxUint256],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
        console.log(`[Intent #${intentId}] Approved: ${approveTx}`);
      }

      approvedTokens.add(outputToken);
    }

    // Fill the intent
    try {
      console.log(
        `[Intent #${intentId}] Filling with outputAmount=${outputAmount}`,
      );

      const fillTx = await walletClient.writeContract({
        address: config.hookAddress,
        abi: aammHookAbi,
        functionName: "fill",
        args: [intentId, outputAmount],
      });

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: fillTx,
      });

      console.log(
        `[Intent #${intentId}] Filled! tx=${fillTx} gas=${receipt.gasUsed}\n`,
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);

      if (message.includes("IntentNotPending")) {
        console.log(`[Intent #${intentId}] Already filled by another agent`);
      } else if (message.includes("DeadlineAlreadyPassed")) {
        console.log(`[Intent #${intentId}] Deadline passed while processing`);
      } else if (message.includes("InsufficientOutput")) {
        console.log(`[Intent #${intentId}] Output below minimum (bug)`);
      } else {
        console.error(`[Intent #${intentId}] Fill failed:`, message);
      }
    }
  }

  // Watch for new IntentCreated events
  publicClient.watchContractEvent({
    address: config.hookAddress,
    abi: aammHookAbi,
    eventName: "IntentCreated",
    pollingInterval: config.pollIntervalMs,
    onLogs: async (logs) => {
      for (const log of logs) {
        await handleIntent(log.args as IntentCreatedArgs);
      }
    },
  });
}
