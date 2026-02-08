import { createFileRoute } from "@tanstack/react-router";

import AgentStats from "@/components/agent-stats";
import IntentFeed from "@/components/intent-feed";
import SwapCard from "@/components/swap-card";
import { useAgentStats } from "@/hooks/use-agent-stats";
import { useIntents } from "@/hooks/use-intents";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  const { intents, isLoading } = useIntents();
  const { agents } = useAgentStats(intents);

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 flex flex-col gap-6">
      {/* Hero: Swap centered with agent stats on the side */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px_1fr] gap-6 items-start">
        {/* Left: Protocol stats */}
        <div className="hidden lg:flex flex-col gap-4 pt-4">
          <div className="font-mono space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-block h-1 w-1 rounded-full bg-terminal-green animate-pulse" />
              <span className="text-[10px] uppercase tracking-widest text-terminal-dim">
                Protocol Status
              </span>
            </div>
            <div className="space-y-2 pl-3 border-l border-terminal-dim/20">
              <div>
                <div className="text-[10px] text-terminal-dim">Total Intents</div>
                <div className="text-lg text-foreground">{intents.length}</div>
              </div>
              <div>
                <div className="text-[10px] text-terminal-dim">Active Agents</div>
                <div className="text-lg text-terminal-green">{agents.length}</div>
              </div>
              <div>
                <div className="text-[10px] text-terminal-dim">Fill Rate</div>
                <div className="text-lg text-terminal-cyan">
                  {intents.length > 0
                    ? `${Math.round(
                        (intents.filter((i) => i.status === 1).length /
                          intents.length) *
                          100,
                      )}%`
                    : "--"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Center: Swap Card */}
        <SwapCard />

        {/* Right: Agent Leaderboard */}
        <div className="hidden lg:block">
          <AgentStats agents={agents} />
        </div>
      </div>

      {/* Mobile: Agent Stats below swap */}
      <div className="lg:hidden">
        <AgentStats agents={agents} />
      </div>

      {/* Bottom: Intent Feed */}
      <IntentFeed intents={intents} isLoading={isLoading} />
    </div>
  );
}
