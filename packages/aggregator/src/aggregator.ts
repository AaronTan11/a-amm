import {
  createPublicClient,
  http,
  type Hex,
} from "viem";
import { sepolia } from "viem/chains";
import { aammHookAbi, IntentStatus } from "./abi.ts";
import { YellowConnection } from "./yellow.ts";
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

  constructor(private config: AggregatorConfig) {
    this.client = createPublicClient({
      chain: sepolia,
      transport: http(config.rpcUrl),
    });
    this.yellow = new YellowConnection(config.aggregatorPrivateKey, config.clearNodeUrl);

    if (config.appSessionId) {
      this.appSessionId = config.appSessionId;
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

    // Broadcast RFQ to agents via Yellow
    const rfq: RFQMessage = {
      type: "rfq",
      intentId,
      amountIn: intent.amountSpecified.toString(),
      minOutputAmount: intent.minOutputAmount.toString(),
      zeroForOne: intent.zeroForOne,
      currency0: intent.poolKey.currency0,
      currency1: intent.poolKey.currency1,
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
