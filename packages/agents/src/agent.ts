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
import { YellowConnection } from "./yellow.ts";
import { getStrategy } from "./strategies.ts";
import type { AgentConfig } from "./config.ts";

interface RFQMessage {
  type: "rfq";
  intentId: number;
  amountIn: string;
  minOutputAmount: string;
  zeroForOne: boolean;
  currency0: Address;
  currency1: Address;
  deadline: number;
}

interface WinnerMessage {
  type: "winner";
  intentId: number;
  winnerAddress: Address;
  outputAmount: string;
}

export async function startAgent(config: AgentConfig): Promise<void> {
  const account = privateKeyToAccount(config.agentPrivateKey);
  const strategy = getStrategy(config.agentStrategy);

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
  const approvedTokens = new Set<Address>();

  console.log(`[${strategy.name}] Address: ${agentAddress}`);
  console.log(`[${strategy.name}] Strategy: ${config.agentStrategy}`);

  // Connect to Yellow ClearNode
  const yellow = new YellowConnection(config.agentPrivateKey, config.clearNodeUrl);
  await yellow.connect();

  // Listen for RFQ and Winner messages from aggregator
  yellow.onMessage((raw: string) => {
    try {
      const parsed = JSON.parse(raw);
      const params = parsed.req?.[2] ?? parsed.res?.[2];
      if (!params || typeof params !== "object") return;

      if (params.type === "rfq") {
        handleRFQ(params as RFQMessage);
      } else if (params.type === "winner") {
        handleWinner(params as WinnerMessage);
      }
    } catch {
      // Not a message we care about
    }
  });

  console.log(`[${strategy.name}] Listening for RFQs...\n`);

  // Also keep the original on-chain watcher as fallback
  // (in case no aggregator is running)
  startOnChainWatcher();

  async function handleRFQ(rfq: RFQMessage): Promise<void> {
    const amountIn = BigInt(rfq.amountIn);
    const minOutput = BigInt(rfq.minOutputAmount);

    // Compute quote using strategy
    const outputAmount = strategy.computeQuote(amountIn, minOutput);
    if (outputAmount === 0n) {
      console.log(`[${strategy.name}] Skipping intent #${rfq.intentId} — not profitable`);
      return;
    }

    // Determine output token and check balance
    const outputToken = rfq.zeroForOne ? rfq.currency1 : rfq.currency0;
    const balance = await publicClient.readContract({
      address: outputToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [agentAddress],
    });

    if (balance < outputAmount) {
      console.log(
        `[${strategy.name}] Skipping intent #${rfq.intentId} — insufficient balance (have ${balance}, need ${outputAmount})`,
      );
      return;
    }

    console.log(
      `[${strategy.name}] Quoting intent #${rfq.intentId}: outputAmount=${outputAmount}`,
    );

    // Submit quote via Yellow
    if (config.appSessionId) {
      await yellow.sendAppMessage(config.appSessionId, {
        type: "quote",
        intentId: rfq.intentId,
        agentAddress,
        agentName: strategy.name,
        outputAmount: outputAmount.toString(),
        timestamp: Date.now(),
      });
    }
  }

  async function handleWinner(msg: WinnerMessage): Promise<void> {
    if (msg.winnerAddress.toLowerCase() !== agentAddress.toLowerCase()) {
      console.log(`[${strategy.name}] Intent #${msg.intentId} won by ${msg.winnerAddress}`);
      return;
    }

    console.log(`[${strategy.name}] WON intent #${msg.intentId}! Filling on-chain...`);
    await fillOnChain(BigInt(msg.intentId), BigInt(msg.outputAmount));
  }

  async function fillOnChain(intentId: bigint, outputAmount: bigint): Promise<void> {
    // Read intent to get output token
    const intent = await publicClient.readContract({
      address: config.hookAddress,
      abi: aammHookAbi,
      functionName: "getIntent",
      args: [intentId],
    });

    if (intent.status !== IntentStatus.Pending) {
      console.log(`[${strategy.name}] Intent #${intentId} no longer pending`);
      return;
    }

    const outputToken: Address = intent.zeroForOne
      ? intent.poolKey.currency1
      : intent.poolKey.currency0;

    // Approve if needed
    if (!approvedTokens.has(outputToken)) {
      const allowance = await publicClient.readContract({
        address: outputToken,
        abi: erc20Abi,
        functionName: "allowance",
        args: [agentAddress, config.hookAddress],
      });

      if (allowance < outputAmount) {
        console.log(`[${strategy.name}] Approving hook for output token...`);
        const approveTx = await walletClient.writeContract({
          address: outputToken,
          abi: erc20Abi,
          functionName: "approve",
          args: [config.hookAddress, maxUint256],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
      }
      approvedTokens.add(outputToken);
    }

    // Fill the intent
    try {
      const fillTx = await walletClient.writeContract({
        address: config.hookAddress,
        abi: aammHookAbi,
        functionName: "fill",
        args: [intentId, outputAmount],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: fillTx });
      console.log(`[${strategy.name}] Filled intent #${intentId}! tx=${fillTx} gas=${receipt.gasUsed}\n`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("IntentNotPending")) {
        console.log(`[${strategy.name}] Intent #${intentId} already filled`);
      } else if (message.includes("DeadlineAlreadyPassed")) {
        console.log(`[${strategy.name}] Intent #${intentId} deadline passed`);
      } else {
        console.error(`[${strategy.name}] Fill failed:`, message);
      }
    }
  }

  // Fallback: direct on-chain watching for when no aggregator is running
  function startOnChainWatcher(): void {
    publicClient.watchContractEvent({
      address: config.hookAddress,
      abi: aammHookAbi,
      eventName: "IntentCreated",
      pollingInterval: config.pollIntervalMs,
      onLogs: async (logs) => {
        for (const log of logs) {
          const args = log.args as any;
          if (!args.intentId) continue;

          // If we have a Yellow connection, the aggregator handles competition.
          // Only direct-fill when no app session is configured (standalone mode).
          if (config.appSessionId) continue;

          const amountIn = args.amountIn as bigint;
          const minOutput = args.minOutputAmount as bigint;
          const outputAmount = strategy.computeQuote(amountIn, minOutput);
          if (outputAmount === 0n) continue;

          await fillOnChain(args.intentId as bigint, outputAmount);
        }
      },
    });
  }
}
