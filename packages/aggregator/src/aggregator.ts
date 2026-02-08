import {
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { aammHookAbi, erc20Abi, IntentStatus } from "./abi.ts";
import { YellowConnection } from "./yellow.ts";
import { submitFeedback } from "./erc8004.ts";
import type { AggregatorConfig } from "./config.ts";
import type {
  Intent,
  Auction,
  RFQMessage,
  QuoteMessage,
  WinnerMessage,
} from "./types.ts";

export class Aggregator {
  private client;
  private yellow: YellowConnection;
  private auctions = new Map<number, Auction>();
  private appSessionId: Hex | null = null;
  private lastScannedBlock = 0n;
  private running = false;

  // ERC-8004 reputation (optional — needs SEPOLIA_RPC_URL + AGENT_IDS)
  private sepoliaPublicClient;
  private sepoliaWalletClient;

  constructor(private config: AggregatorConfig) {
    this.client = createPublicClient({
      chain: sepolia,
      transport: http(config.rpcUrl),
    });
    this.yellow = new YellowConnection(config.aggregatorPrivateKey, config.clearNodeUrl);

    if (config.appSessionId) {
      this.appSessionId = config.appSessionId;
    }

    // Set up Sepolia clients for ERC-8004 if configured
    if (config.sepoliaRpcUrl) {
      const account = privateKeyToAccount(config.aggregatorPrivateKey);
      this.sepoliaPublicClient = createPublicClient({
        chain: sepolia,
        transport: http(config.sepoliaRpcUrl),
      });
      this.sepoliaWalletClient = createWalletClient({
        account,
        chain: sepolia,
        transport: http(config.sepoliaRpcUrl),
      });
      console.log(`[aggregator] ERC-8004 reputation enabled (${config.agentIds.size} agents mapped)`);
    }
  }

  async run(): Promise<void> {
    // Connect to Yellow ClearNode
    console.log("[aggregator] connecting to Yellow...");
    await this.yellow.connect();

    // Create app session if not provided
    if (!this.appSessionId) {
      console.log("[aggregator] creating app session...");
      this.appSessionId = await this.yellow.createAppSession(
        [this.yellow.address],
        [{ asset: "usdc", amount: "0", participant: this.yellow.address }],
      );
      console.log(`[aggregator] app session: ${this.appSessionId}`);
    }

    // Listen for incoming quotes from agents
    this.yellow.onMessage((raw: string) => {
      this.handleYellowMessage(raw);
    });

    // Start polling for intents
    this.running = true;
    console.log("[aggregator] watching for intents...\n");
    await this.pollLoop();
  }

  stop(): void {
    this.running = false;
    this.yellow.disconnect();
  }

  private async pollLoop(): Promise<void> {
    while (this.running) {
      try {
        await this.scanForIntents();
      } catch (err) {
        console.error("[aggregator] scan error:", err);
      }
      await sleep(this.config.pollIntervalMs);
    }
  }

  private async scanForIntents(): Promise<void> {
    const currentBlock = await this.client.getBlockNumber();
    if (this.lastScannedBlock === 0n) {
      this.lastScannedBlock = currentBlock > 100n ? currentBlock - 100n : 0n;
    }

    if (currentBlock <= this.lastScannedBlock) return;

    const logs = await this.client.getLogs({
      address: this.config.hookAddress,
      event: {
        type: "event",
        name: "IntentCreated",
        inputs: [
          { type: "uint256", name: "intentId", indexed: true },
          { type: "address", name: "swapper", indexed: true },
          { type: "bytes32", name: "poolId", indexed: true },
          { type: "bool", name: "zeroForOne" },
          { type: "uint256", name: "amountIn" },
          { type: "uint256", name: "minOutputAmount" },
          { type: "uint256", name: "deadline" },
        ],
      },
      fromBlock: this.lastScannedBlock + 1n,
      toBlock: currentBlock,
    });

    for (const log of logs) {
      const args = log.args;
      if (!args.intentId) continue;

      const intentId = Number(args.intentId);
      if (this.auctions.has(intentId)) continue;

      console.log(`[aggregator] new intent #${intentId} — amountIn: ${args.amountIn}, minOutput: ${args.minOutputAmount}`);

      // Fetch full intent from contract
      const intent = await this.fetchIntent(args.intentId);
      if (intent.status !== IntentStatus.Pending) continue;

      await this.startAuction(intentId, intent);
    }

    this.lastScannedBlock = currentBlock;
  }

  private async fetchIntent(intentId: bigint): Promise<Intent> {
    const result = await this.client.readContract({
      address: this.config.hookAddress,
      abi: aammHookAbi,
      functionName: "getIntent",
      args: [intentId],
    }) as any;

    return {
      intentId: result.intentId,
      swapper: result.swapper,
      poolKey: {
        currency0: result.poolKey.currency0,
        currency1: result.poolKey.currency1,
        fee: Number(result.poolKey.fee),
        tickSpacing: Number(result.poolKey.tickSpacing),
        hooks: result.poolKey.hooks,
      },
      zeroForOne: result.zeroForOne,
      amountSpecified: result.amountSpecified,
      minOutputAmount: result.minOutputAmount,
      deadline: result.deadline,
      status: Number(result.status),
      filledBy: result.filledBy,
      outputAmount: result.outputAmount,
    };
  }

  private async startAuction(intentId: number, intent: Intent): Promise<void> {
    const auction: Auction = {
      intentId,
      intent,
      quotes: [],
      startedAt: Date.now(),
    };
    this.auctions.set(intentId, auction);

    // Fetch token decimals for proper scale conversion
    const [decimals0, decimals1] = await Promise.all([
      this.client.readContract({
        address: intent.poolKey.currency0,
        abi: erc20Abi,
        functionName: "decimals",
      }),
      this.client.readContract({
        address: intent.poolKey.currency1,
        abi: erc20Abi,
        functionName: "decimals",
      }),
    ]);

    // Broadcast RFQ to agents via Yellow
    const rfq: RFQMessage = {
      type: "rfq",
      intentId,
      amountIn: intent.amountSpecified.toString(),
      minOutputAmount: intent.minOutputAmount.toString(),
      zeroForOne: intent.zeroForOne,
      currency0: intent.poolKey.currency0,
      currency1: intent.poolKey.currency1,
      currency0Decimals: Number(decimals0),
      currency1Decimals: Number(decimals1),
      deadline: Number(intent.deadline),
    };

    if (this.appSessionId) {
      await this.yellow.sendAppMessage(this.appSessionId, rfq);
      console.log(`[aggregator] broadcast RFQ for intent #${intentId}`);
    }

    // Set timer to close auction
    setTimeout(() => {
      this.closeAuction(intentId);
    }, this.config.quoteWindowMs);
  }

  private async closeAuction(intentId: number): Promise<void> {
    const auction = this.auctions.get(intentId);
    if (!auction) return;

    this.auctions.delete(intentId);

    if (auction.quotes.length === 0) {
      console.log(`[aggregator] auction #${intentId} closed — no quotes received`);
      return;
    }

    // Pick the best quote (highest output amount)
    const sorted = [...auction.quotes].sort(
      (a, b) => (b.outputAmount > a.outputAmount ? 1 : b.outputAmount < a.outputAmount ? -1 : 0),
    );
    const winner = sorted[0]!;

    console.log(
      `[aggregator] auction #${intentId} winner: ${winner.agentName} (${winner.agentAddress}) — output: ${winner.outputAmount}`,
    );

    // Notify winner via Yellow
    const winnerMsg: WinnerMessage = {
      type: "winner",
      intentId,
      winnerAddress: winner.agentAddress,
      outputAmount: winner.outputAmount.toString(),
    };

    if (this.appSessionId) {
      await this.yellow.sendAppMessage(this.appSessionId, winnerMsg);
    }

    // Submit ERC-8004 reputation feedback (fire-and-forget)
    this.submitReputationFeedback(winner.agentAddress as Address, winner.outputAmount, auction.intent.minOutputAmount);
  }

  private submitReputationFeedback(agentAddress: Address, outputAmount: bigint, minOutput: bigint): void {
    if (!this.sepoliaWalletClient || !this.sepoliaPublicClient) return;

    const agentId = this.config.agentIds.get(agentAddress.toLowerCase());
    if (!agentId) {
      console.log(`[aggregator] no ERC-8004 agentId mapped for ${agentAddress}, skipping feedback`);
      return;
    }

    // Score: percentage improvement over minimum, capped at 100
    const improvement = minOutput > 0n
      ? Number(((outputAmount - minOutput) * 100n) / minOutput)
      : 50;
    const score = Math.min(100, Math.max(1, improvement + 50)); // base 50 + improvement

    submitFeedback(this.sepoliaWalletClient, this.sepoliaPublicClient, agentId, score)
      .then(() => console.log(`[aggregator] reputation feedback submitted for agent ${agentAddress} (score=${score})`))
      .catch((err) => console.error(`[aggregator] reputation feedback failed:`, err));
  }

  private handleYellowMessage(raw: string): void {
    try {
      const parsed = JSON.parse(raw);

      // Try to extract message data from app session message format
      // The SDK wraps messages as: { req: [id, "message", { ...params }, ts], sig: [...] }
      const params = parsed.req?.[2];
      if (!params || typeof params !== "object") return;

      // Check if this is a quote message
      if (params.type === "quote") {
        this.handleQuote(params as QuoteMessage);
      }
    } catch {
      // Not a message we care about
    }
  }

  private handleQuote(quote: QuoteMessage): void {
    const auction = this.auctions.get(quote.intentId);
    if (!auction) {
      console.log(`[aggregator] ignoring quote for unknown/closed intent #${quote.intentId}`);
      return;
    }

    const outputAmount = BigInt(quote.outputAmount);

    // Validate quote meets minimum output
    if (outputAmount < auction.intent.minOutputAmount) {
      console.log(
        `[aggregator] rejecting quote from ${quote.agentName}: ${outputAmount} < minOutput ${auction.intent.minOutputAmount}`,
      );
      return;
    }

    auction.quotes.push({
      agentAddress: quote.agentAddress,
      agentName: quote.agentName,
      outputAmount,
      timestamp: quote.timestamp,
    });

    console.log(
      `[aggregator] received quote from ${quote.agentName}: ${outputAmount} for intent #${quote.intentId} (${auction.quotes.length} total)`,
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
