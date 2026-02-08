import { useRef, useEffect } from "react";
import { formatEther } from "viem";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { IntentStatus } from "@/lib/contracts";
import { type Intent, statusLabel } from "@/hooks/use-intents";

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

function formatAmount(wei: bigint): string {
  const eth = formatEther(wei < 0n ? -wei : wei);
  // Truncate to 4 decimal places
  const dot = eth.indexOf(".");
  if (dot === -1) return eth;
  return eth.slice(0, dot + 5);
}

export default function IntentFeed({
  intents,
  isLoading,
}: {
  intents: Intent[];
  isLoading: boolean;
}) {
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
          <div className="grid grid-cols-[40px_70px_1fr_1fr_100px_80px] gap-2 px-4 py-1.5 text-[10px] uppercase tracking-wider text-terminal-dim border-b border-border sticky top-0 bg-card">
            <span>#</span>
            <span>Status</span>
            <span>Amount In</span>
            <span>Output</span>
            <span>Agent</span>
            <span>Deadline</span>
          </div>

          {intents.length === 0 && !isLoading && (
            <div className="px-4 py-6 text-terminal-dim text-center text-[10px]">
              No intents yet. Submit a swap to create one.
            </div>
          )}

          {intents.map((intent) => (
            <div
              key={intent.intentId.toString()}
              className="grid grid-cols-[40px_70px_1fr_1fr_100px_80px] gap-2 px-4 py-1.5 text-[11px] border-b border-border/50 hover:bg-accent/30 transition-colors"
            >
              <span className="text-terminal-dim">
                {intent.intentId.toString()}
              </span>
              <span className={`${statusColor(intent.status)} flex items-center gap-1`}>
                {intent.status === IntentStatus.Pending && (
                  <span className="inline-block h-1 w-1 rounded-full bg-terminal-amber animate-pulse" />
                )}
                {statusLabel(intent.status)}
              </span>
              <span className="text-foreground">
                {formatAmount(intent.amountSpecified)}
              </span>
              <span className={intent.status === IntentStatus.Filled ? "text-terminal-green" : "text-terminal-dim"}>
                {intent.status === IntentStatus.Filled
                  ? formatAmount(intent.outputAmount)
                  : formatAmount(intent.minOutputAmount) + " min"}
              </span>
              <span className="text-terminal-dim">
                {intent.status === IntentStatus.Filled
                  ? truncateAddress(intent.filledBy)
                  : "--"}
              </span>
              <span className="text-terminal-dim">
                #{intent.deadline.toString()}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
