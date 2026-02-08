import { useRef, useEffect } from "react";
import { formatUnits } from "viem";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { IntentStatus } from "@/lib/contracts";
import { type Intent, statusLabel } from "@/hooks/use-intents";
import { TOKENS } from "@/lib/tokens";

function statusColor(status: number): string {
  switch (status) {
    case IntentStatus.Pending:
      return "text-terminal-amber";
    case IntentStatus.Filled:
      return "text-terminal-green";
    case IntentStatus.Cancelled:
    case IntentStatus.Expired:
      return "text-terminal-red";
    default:
      return "text-terminal-dim";
  }
}

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}..${addr.slice(-4)}`;
}

function getDecimals(address: string): number {
  const token = TOKENS.find(
    (t) => t.address.toLowerCase() === address.toLowerCase(),
  );
  return token?.decimals ?? 18;
}

function formatAmount(wei: bigint, decimals: number): string {
  const val = formatUnits(wei < 0n ? -wei : wei, decimals);
  const dot = val.indexOf(".");
  if (dot === -1) return val;
  return val.slice(0, dot + 5);
}

interface IntentFeedProps {
  intents: Intent[];
  isLoading: boolean;
  currentBlock?: bigint;
  connectedAddress?: string;
  onCancel?: (intentId: bigint) => void;
  onFallback?: (intentId: bigint) => void;
  cancellingId?: bigint | null;
  fallbackId?: bigint | null;
}

export default function IntentFeed({
  intents,
  isLoading,
  currentBlock,
  connectedAddress,
  onCancel,
  onFallback,
  cancellingId,
  fallbackId,
}: IntentFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [intents.length]);

  return (
    <Card className="font-mono">
      <CardHeader className="border-b border-border">
        <CardTitle className="text-terminal-cyan text-xs uppercase tracking-widest flex items-center gap-2">
          &gt; Intent Feed
          {isLoading && (
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-terminal-amber animate-pulse" />
          )}
          <span className="ml-auto text-terminal-dim font-normal">
            {intents.length} intents
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div
          ref={scrollRef}
          className="max-h-[320px] overflow-y-auto overflow-x-auto"
        >
          {/* Header row */}
          <div className="grid grid-cols-[40px_70px_1fr_1fr_100px_90px_70px] gap-2 px-4 py-1.5 text-[10px] uppercase tracking-wider text-terminal-dim border-b border-border sticky top-0 bg-card">
            <span>#</span>
            <span>Status</span>
            <span>Amount In</span>
            <span>Output</span>
            <span>Agent</span>
            <span>Deadline</span>
            <span></span>
          </div>

          {intents.length === 0 && !isLoading && (
            <div className="px-4 py-6 text-terminal-dim text-center text-[10px]">
              No intents yet. Submit a swap to create one.
            </div>
          )}

          {intents.map((intent) => {
            const isPending = intent.status === IntentStatus.Pending;
            const blocksRemaining =
              currentBlock !== undefined && isPending
                ? Number(intent.deadline - currentBlock)
                : null;
            const isOverdue = blocksRemaining !== null && blocksRemaining <= 0;
            const isOwnIntent =
              connectedAddress &&
              intent.swapper.toLowerCase() === connectedAddress.toLowerCase();
            const isCancelling = cancellingId === intent.intentId;
            const isFallbacking = fallbackId === intent.intentId;

            return (
              <div
                key={intent.intentId.toString()}
                className="grid grid-cols-[40px_70px_1fr_1fr_100px_90px_70px] gap-2 px-4 py-1.5 text-[11px] border-b border-border/50 hover:bg-accent/30 transition-colors"
              >
                <span className="text-terminal-dim">
                  {intent.intentId.toString()}
                </span>
                <span className={`${statusColor(intent.status)} flex items-center gap-1`}>
                  {isPending && (
                    <span className="inline-block h-1 w-1 rounded-full bg-terminal-amber animate-pulse" />
                  )}
                  {statusLabel(intent.status)}
                </span>
                <span className="text-foreground">
                  {formatAmount(intent.amountSpecified, getDecimals(intent.zeroForOne ? intent.poolKey.currency0 : intent.poolKey.currency1))}
                </span>
                <span className={intent.status === IntentStatus.Filled ? "text-terminal-green" : "text-terminal-dim"}>
                  {intent.status === IntentStatus.Filled
                    ? formatAmount(intent.outputAmount, getDecimals(intent.zeroForOne ? intent.poolKey.currency1 : intent.poolKey.currency0))
                    : formatAmount(intent.minOutputAmount, getDecimals(intent.zeroForOne ? intent.poolKey.currency0 : intent.poolKey.currency1)) + " min"}
                </span>
                <span className="text-terminal-dim">
                  {intent.status === IntentStatus.Filled
                    ? truncateAddress(intent.filledBy)
                    : "--"}
                </span>
                {/* Deadline */}
                <span
                  className={
                    isOverdue
                      ? "text-terminal-red animate-pulse"
                      : isPending && blocksRemaining !== null
                        ? "text-terminal-amber"
                        : "text-terminal-dim"
                  }
                >
                  {isPending && blocksRemaining !== null
                    ? isOverdue
                      ? "OVERDUE"
                      : `${blocksRemaining} blks`
                    : `#${intent.deadline.toString()}`}
                </span>
                {/* Actions */}
                <span className="flex items-center gap-1">
                  {isPending && isOwnIntent && onCancel && (
                    <button
                      type="button"
                      onClick={() => onCancel(intent.intentId)}
                      disabled={isCancelling}
                      className="text-terminal-red hover:text-terminal-red/80 text-[10px] disabled:opacity-50 transition-colors"
                    >
                      {isCancelling ? (
                        <span className="animate-pulse">cancelling...</span>
                      ) : (
                        "[cancel]"
                      )}
                    </button>
                  )}
                  {isPending && isOverdue && onFallback && (
                    <button
                      type="button"
                      onClick={() => onFallback(intent.intentId)}
                      disabled={isFallbacking}
                      className="text-terminal-amber hover:text-terminal-amber/80 text-[10px] disabled:opacity-50 transition-colors"
                    >
                      {isFallbacking ? (
                        <span className="animate-pulse">executing...</span>
                      ) : (
                        "[fallback]"
                      )}
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
