import { formatEther } from "viem";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AgentStat } from "@/hooks/use-agent-stats";

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}..${addr.slice(-4)}`;
}

export default function AgentStats({ agents }: { agents: AgentStat[] }) {
  return (
    <Card className="font-mono">
      <CardHeader className="border-b border-border">
        <CardTitle className="text-terminal-cyan text-xs uppercase tracking-widest">
          &gt; Agent Leaderboard
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {/* Header */}
        <div className="grid grid-cols-[30px_1fr_50px_80px] gap-2 px-4 py-1.5 text-[10px] uppercase tracking-wider text-terminal-dim border-b border-border">
          <span>#</span>
          <span>Agent</span>
          <span>Fills</span>
          <span>Volume</span>
        </div>

        {agents.length === 0 && (
          <div className="px-4 py-6 text-terminal-dim text-center text-[10px]">
            No agents have filled intents yet.
          </div>
        )}

        {agents.map((agent, i) => (
          <div
            key={agent.address}
            className="grid grid-cols-[30px_1fr_50px_80px] gap-2 px-4 py-1.5 text-[11px] border-b border-border/50 hover:bg-accent/30 transition-colors"
          >
            <span className="text-terminal-amber">{i + 1}</span>
            <span className="text-terminal-green">
              {truncateAddress(agent.address)}
            </span>
            <span className="text-foreground">{agent.fillCount}</span>
            <span className="text-terminal-dim">
              {formatEther(agent.totalOutput).slice(0, 8)}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
