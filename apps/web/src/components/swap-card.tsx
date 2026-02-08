import { useState } from "react";
import { parseUnits } from "viem";
import { useAccount } from "wagmi";

import { Button } from "@/components/ui/button";
import { useSwap } from "@/hooks/use-swap";
import { DEFAULT_SLIPPAGE_BPS, POOL_CONFIG, TOKENS, type Token } from "@/lib/tokens";

function TokenSelector({
  selected,
  onSelect,
  exclude,
  disabled,
}: {
  selected: Token;
  onSelect: (t: Token) => void;
  exclude?: Token;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const available = TOKENS.filter((t) => t.symbol !== exclude?.symbol);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 bg-background/50 border border-border hover:border-terminal-cyan/40 transition-colors disabled:opacity-40 min-w-[120px]"
      >
        <span
          className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: selected.color }}
        />
        <span className="text-foreground font-bold text-sm">
          {selected.symbol}
        </span>
        <svg
          className="ml-auto h-3 w-3 text-terminal-dim"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-full bg-card border border-border shadow-lg">
          {available.map((token) => (
            <button
              key={token.symbol}
              type="button"
              className="flex items-center gap-2 w-full px-3 py-2 hover:bg-accent/50 transition-colors text-left"
              onClick={() => {
                onSelect(token);
                setOpen(false);
              }}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: token.color }}
              />
              <span className="text-xs font-medium">{token.symbol}</span>
              <span className="text-[10px] text-terminal-dim ml-auto">
                {token.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SwapCard() {
  const { isConnected } = useAccount();
  const { swap, hash, isPending, isSuccess, error, reset } = useSwap();

  const [fromToken, setFromToken] = useState<Token>(TOKENS[0]!);
  const [toToken, setToToken] = useState<Token>(TOKENS[1]!);
  const [amount, setAmount] = useState("");
  const [slippageBps] = useState(DEFAULT_SLIPPAGE_BPS);

  const handleFlip = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setAmount("");
    reset();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !isConnected) return;

    const amountIn = parseUnits(amount, fromToken.decimals);
    // Auto-compute min output: amount minus slippage tolerance
    const minOutput = (amountIn * BigInt(10000 - slippageBps)) / 10000n;

    // Sort tokens to get currency0/currency1 (lower address = currency0)
    const fromLower =
      fromToken.address.toLowerCase() < toToken.address.toLowerCase();
    const currency0 = fromLower ? fromToken.address : toToken.address;
    const currency1 = fromLower ? toToken.address : fromToken.address;
    const zeroForOne = fromLower;

    swap({
      routerAddress: POOL_CONFIG.routerAddress,
      currency0,
      currency1,
      fee: POOL_CONFIG.fee,
      tickSpacing: POOL_CONFIG.tickSpacing,
      zeroForOne,
      amountIn,
      minOutputAmount: minOutput,
    });
  };

  // Estimate output (simple 1:1 minus spread for display — agents set real price)
  const estimatedOutput = amount
    ? (
        (Number(amount) * (10000 - slippageBps)) /
        10000
      ).toFixed(4)
    : "";

  return (
    <div className="font-mono relative">
      {/* Subtle glow effect */}
      <div className="absolute -inset-px bg-gradient-to-b from-terminal-cyan/20 via-transparent to-terminal-green/10 pointer-events-none" />

      <div className="relative bg-card border border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <span className="text-terminal-cyan text-xs uppercase tracking-widest">
            &gt; Swap
          </span>
          <div className="flex items-center gap-1.5 text-[10px] text-terminal-dim">
            <span>Slippage:</span>
            <span className="text-terminal-amber">{slippageBps / 100}%</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col">
          {/* You Pay */}
          <div className="px-5 py-4">
            <div className="text-[10px] uppercase tracking-wider text-terminal-dim mb-2">
              You pay
            </div>
            <div className="flex items-center gap-3">
              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={amount}
                onChange={(e) => {
                  // Only allow numbers and decimal
                  const v = e.target.value;
                  if (v === "" || /^\d*\.?\d*$/.test(v)) setAmount(v);
                }}
                disabled={!isConnected}
                className="flex-1 bg-transparent text-2xl font-light text-foreground placeholder:text-muted-foreground/30 outline-none disabled:opacity-30 min-w-0"
              />
              <TokenSelector
                selected={fromToken}
                onSelect={setFromToken}
                exclude={toToken}
                disabled={!isConnected}
              />
            </div>
          </div>

          {/* Flip button */}
          <div className="relative h-0 flex items-center justify-center z-10">
            <button
              type="button"
              onClick={handleFlip}
              className="bg-card border border-border h-8 w-8 flex items-center justify-center hover:border-terminal-cyan/50 hover:text-terminal-cyan transition-colors group"
            >
              <svg
                className="h-3.5 w-3.5 text-terminal-dim group-hover:text-terminal-cyan transition-colors"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                />
              </svg>
            </button>
          </div>

          {/* You Receive */}
          <div className="px-5 py-4 bg-background/30 border-t border-border">
            <div className="text-[10px] uppercase tracking-wider text-terminal-dim mb-2">
              You receive
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                {estimatedOutput ? (
                  <div>
                    <span className="text-2xl font-light text-foreground/70">
                      ~{estimatedOutput}
                    </span>
                    <div className="text-[10px] text-terminal-dim mt-0.5">
                      Agents compete for best price
                    </div>
                  </div>
                ) : (
                  <span className="text-2xl font-light text-muted-foreground/30">
                    0
                  </span>
                )}
              </div>
              <TokenSelector
                selected={toToken}
                onSelect={setToToken}
                exclude={fromToken}
                disabled={!isConnected}
              />
            </div>
          </div>

          {/* Submit */}
          <div className="px-5 py-4 border-t border-border">
            <Button
              type="submit"
              disabled={!isConnected || isPending || !amount}
              className="w-full h-10 text-sm bg-terminal-green/15 text-terminal-green border border-terminal-green/30 hover:bg-terminal-green/25 hover:border-terminal-green/50 disabled:opacity-20 transition-all"
            >
              {!isConnected
                ? "Connect Wallet to Swap"
                : isPending
                  ? "Submitting Intent..."
                  : amount
                    ? `Swap ${amount} ${fromToken.symbol} → ${toToken.symbol}`
                    : "Enter Amount"}
            </Button>
          </div>
        </form>

        {/* Status bar */}
        {(hash || error) && (
          <div className="px-5 py-2.5 border-t border-border bg-background/30 flex items-center gap-2 text-[10px]">
            {hash && (
              <>
                <span className="text-terminal-dim">TX</span>
                <span
                  className={
                    isSuccess ? "text-terminal-green" : "text-terminal-amber"
                  }
                >
                  {hash.slice(0, 10)}...{hash.slice(-6)}
                </span>
                {isSuccess && (
                  <span className="text-terminal-green font-bold">CONFIRMED</span>
                )}
              </>
            )}
            {error && (
              <span className="text-terminal-red truncate">
                {error.message.slice(0, 60)}
              </span>
            )}
            <button
              onClick={reset}
              className="ml-auto text-terminal-dim hover:text-foreground"
            >
              [clear]
            </button>
          </div>
        )}
      </div>

      {/* How it works hint */}
      <div className="mt-3 px-1 space-y-1">
        {[
          "Submit intent → hook holds your tokens",
          "AI agents compete off-chain for best price",
          "Winner fills on-chain, or AMM fallback kicks in",
        ].map((step, i) => (
          <div
            key={i}
            className="flex items-start gap-2 text-[10px] text-terminal-dim"
          >
            <span className="text-terminal-cyan shrink-0">
              {i + 1}.
            </span>
            <span>{step}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
