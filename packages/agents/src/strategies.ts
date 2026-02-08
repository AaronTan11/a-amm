export interface Strategy {
  name: string;
  /** Compute a quote for the given input amount and minimum output. Return 0n to skip. */
  computeQuote(amountIn: bigint, minOutput: bigint, inputDecimals: number, outputDecimals: number): bigint;
}

/** Scale a value from input token decimals to output token decimals */
function scaleDecimals(value: bigint, inputDecimals: number, outputDecimals: number): bigint {
  const diff = outputDecimals - inputDecimals;
  return diff >= 0
    ? value * 10n ** BigInt(diff)
    : value / 10n ** BigInt(-diff);
}

/** Speedy: quotes fast, competitive pricing (2% spread) */
export const speedy: Strategy = {
  name: "Speedy",
  computeQuote: (amountIn, minOutput, inputDecimals, outputDecimals) => {
    const quote = (amountIn * 98n) / 100n;
    const scaled = scaleDecimals(quote, inputDecimals, outputDecimals);
    return scaled > minOutput ? scaled : minOutput;
  },
};

/** Cautious: only quotes when profitable (8% spread), skips tight margins */
export const cautious: Strategy = {
  name: "Cautious",
  computeQuote: (amountIn, minOutput, inputDecimals, outputDecimals) => {
    const quote = (amountIn * 92n) / 100n;
    const scaled = scaleDecimals(quote, inputDecimals, outputDecimals);
    return scaled >= minOutput ? scaled : 0n;
  },
};

/** Whale: handles big orders, small premium (3% spread) */
export const whale: Strategy = {
  name: "Whale",
  computeQuote: (amountIn, minOutput, inputDecimals, outputDecimals) => {
    const quote = (amountIn * 97n) / 100n;
    const scaled = scaleDecimals(quote, inputDecimals, outputDecimals);
    return scaled > minOutput ? scaled : minOutput;
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
