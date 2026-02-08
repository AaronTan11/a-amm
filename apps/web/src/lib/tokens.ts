import type { Address } from "viem";

export interface Token {
  symbol: string;
  name: string;
  address: Address;
  decimals: number;
  color: string;
}

// Sepolia testnet tokens
export const TOKENS: Token[] = [
  {
    symbol: "USDC",
    name: "USD Coin",
    address: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
    decimals: 6,
    color: "#2775CA",
  },
  {
    symbol: "WETH",
    name: "Wrapped Ether",
    address: "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9",
    decimals: 18,
    color: "#627EEA",
  },
  {
    symbol: "DAI",
    name: "Dai Stablecoin",
    address: "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357",
    decimals: 18,
    color: "#F5AC37",
  },
];

// Uniswap v4 Sepolia deployment
export const POOL_CONFIG = {
  routerAddress: "0x9B6b46e2c869aa39918Db7f52f5557FE577B6eEe" as Address, // PoolSwapTest
  fee: 3000,
  tickSpacing: 60,
};

// Slippage tolerance (1% default)
export const DEFAULT_SLIPPAGE_BPS = 100;
