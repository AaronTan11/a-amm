import type { Address } from "viem";

/** RFQ broadcast from aggregator to agents via Yellow app session */
export interface RFQMessage {
  type: "rfq";
  intentId: number;
  amountIn: string;
  minOutputAmount: string;
  zeroForOne: boolean;
  currency0: Address;
  currency1: Address;
  currency0Decimals: number;
  currency1Decimals: number;
  deadline: number;
}

/** Quote submitted by an agent in response to an RFQ */
export interface QuoteMessage {
  type: "quote";
  intentId: number;
  agentAddress: Address;
  agentName: string;
  outputAmount: string;
  timestamp: number;
}

/** Winner notification sent by aggregator to agents */
export interface WinnerMessage {
  type: "winner";
  intentId: number;
  winnerAddress: Address;
  outputAmount: string;
}

export type YellowMessage = RFQMessage | QuoteMessage | WinnerMessage;

/** On-chain intent as read from the hook contract */
export interface Intent {
  intentId: bigint;
  swapper: Address;
  poolKey: {
    currency0: Address;
    currency1: Address;
    fee: number;
    tickSpacing: number;
    hooks: Address;
  };
  zeroForOne: boolean;
  amountSpecified: bigint;
  minOutputAmount: bigint;
  deadline: bigint;
  status: number;
  filledBy: Address;
  outputAmount: bigint;
}

/** Collected quote during an auction */
export interface AuctionQuote {
  agentAddress: Address;
  agentName: string;
  outputAmount: bigint;
  timestamp: number;
}

/** Active auction state */
export interface Auction {
  intentId: number;
  intent: Intent;
  quotes: AuctionQuote[];
  startedAt: number;
}
