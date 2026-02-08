import { loadConfig } from "./config.ts";
import { startAgent } from "./agent.ts";

async function main(): Promise<void> {
  console.log("=== A-AMM Agent ===");
  const config = loadConfig();
  console.log(`  RPC:       ${config.rpcUrl}`);
  console.log(`  Hook:      ${config.hookAddress}`);
  console.log(`  Strategy:  ${config.agentStrategy}`);
  console.log(`  ClearNode: ${config.clearNodeUrl}`);
  console.log(`  Poll:      ${config.pollIntervalMs}ms`);
  console.log("");

  await startAgent(config);
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
