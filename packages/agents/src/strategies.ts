export interface Strategy {
  name: string;
  /** Compute a quote for the given input amount and minimum output. Return 0n to skip. */
  computeQuote(amountIn: bigint, minOutput: bigint): bigint;
}

/**
 * Speedy: quotes fast, competitive pricing.
 * Offers 5% above user's minimum output — best price for the user.
 */
export const speedy: Strategy = {
  name: "Speedy",
  computeQuote: (_amountIn, minOutput) => {
    return (minOutput * 105n) / 100n;
  },
};

/**
 * Cautious: only quotes when profitable, premium pricing.
 * Offers exactly the user's minimum — maximizes agent profit margin.
 * Skips if minOutput is 0 (can't determine fair price).
 */
export const cautious: Strategy = {
  name: "Cautious",
  computeQuote: (_amountIn, minOutput) => {
    return minOutput > 0n ? minOutput : 0n;
  },
};

/**
 * Whale: handles big orders, slight premium.
 * Offers 2% above user's minimum — competitive but conservative.
 */
export const whale: Strategy = {
  name: "Whale",
  computeQuote: (_amountIn, minOutput) => {
    return (minOutput * 102n) / 100n;
  },
};

const strategies: Record<string, Strategy> = { speedy, cautious, whale };

export function getStrategy(name: string): Strategy {
  const strategy = strategies[name.toLowerCase()];
  if (!strategy) {
    throw new Error(`Unknown strategy: ${name}. Available: ${Object.keys(strategies).join(", ")}`);
  }
  return strategy;
}
