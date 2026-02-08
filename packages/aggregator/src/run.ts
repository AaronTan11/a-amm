import { loadConfig } from "./config.ts";
import { Aggregator } from "./aggregator.ts";

async function main(): Promise<void> {
  console.log("=== A-AMM Quote Aggregator ===");
  const config = loadConfig();
  console.log(`  RPC:        ${config.rpcUrl}`);
  console.log(`  Hook:       ${config.hookAddress}`);
  console.log(`  ClearNode:  ${config.clearNodeUrl}`);
  console.log(`  Quote win:  ${config.quoteWindowMs}ms`);
  console.log(`  Poll:       ${config.pollIntervalMs}ms`);
  console.log("");

  const aggregator = new Aggregator(config);
  await aggregator.run();
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
