export interface AggregatorConfig {
  rpcUrl: string;
  aggregatorPrivateKey: `0x${string}`;
  hookAddress: `0x${string}`;
  clearNodeUrl: string;
  quoteWindowMs: number;
  pollIntervalMs: number;
  appSessionId?: `0x${string}`;
  sepoliaRpcUrl?: string;
  agentIds: Map<string, bigint>; // lowercase address → ERC-8004 agentId
}

// Anvil account #9 — dedicated aggregator key, avoids conflict with agents (1-3) and deployer (0)
const DEFAULT_PRIVATE_KEY =
  "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6" as const;

export function loadConfig(): AggregatorConfig {
  const hookAddress = process.env["HOOK_ADDRESS"];
  if (!hookAddress || !hookAddress.startsWith("0x")) {
    throw new Error("HOOK_ADDRESS env var is required (0x-prefixed address)");
  }

  const aggregatorPrivateKey =
    (process.env["AGGREGATOR_PRIVATE_KEY"] as `0x${string}`) ?? DEFAULT_PRIVATE_KEY;
  if (!aggregatorPrivateKey.startsWith("0x") || aggregatorPrivateKey.length !== 66) {
    throw new Error(
      "AGGREGATOR_PRIVATE_KEY must be a 66-character 0x-prefixed hex string",
    );
  }

  const rpcUrl = process.env["RPC_URL"] ?? "http://127.0.0.1:8545";
  const clearNodeUrl = process.env["CLEARNODE_URL"] ?? "wss://clearnet-sandbox.yellow.com/ws";
  const quoteWindowMs = Number(process.env["QUOTE_WINDOW_MS"] ?? "5000");
  const pollIntervalMs = Number(process.env["POLL_INTERVAL_MS"] ?? "2000");
  const appSessionId = process.env["APP_SESSION_ID"] as `0x${string}` | undefined;
  const sepoliaRpcUrl = process.env["SEPOLIA_RPC_URL"];

  // Parse AGENT_IDS: "0xaddr1:42,0xaddr2:43"
  const agentIds = new Map<string, bigint>();
  const agentIdsRaw = process.env["AGENT_IDS"] ?? "";
  if (agentIdsRaw) {
    for (const entry of agentIdsRaw.split(",")) {
      const [addr, id] = entry.trim().split(":");
      if (addr && id) {
        agentIds.set(addr.toLowerCase(), BigInt(id));
      }
    }
  }

  return {
    rpcUrl,
    aggregatorPrivateKey,
    hookAddress: hookAddress as `0x${string}`,
    clearNodeUrl,
    quoteWindowMs,
    pollIntervalMs,
    appSessionId,
    sepoliaRpcUrl,
    agentIds,
  };
}
