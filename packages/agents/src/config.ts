export interface AgentConfig {
  rpcUrl: string;
  agentPrivateKey: `0x${string}`;
  hookAddress: `0x${string}`;
  pollIntervalMs: number;
}

// Anvil account #1 (index 1) — avoids conflict with account #0 used as deployer
const DEFAULT_PRIVATE_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;

export function loadConfig(): AgentConfig {
  const hookAddress = process.env["HOOK_ADDRESS"];
  if (!hookAddress || !hookAddress.startsWith("0x")) {
    throw new Error("HOOK_ADDRESS env var is required (0x-prefixed address)");
  }

  const agentPrivateKey =
    (process.env["AGENT_PRIVATE_KEY"] as `0x${string}`) ?? DEFAULT_PRIVATE_KEY;
  if (!agentPrivateKey.startsWith("0x") || agentPrivateKey.length !== 66) {
    throw new Error(
      "AGENT_PRIVATE_KEY must be a 66-character 0x-prefixed hex string",
    );
  }

  const rpcUrl = process.env["RPC_URL"] ?? "http://127.0.0.1:8545";
  const pollIntervalMs = Number(process.env["POLL_INTERVAL_MS"] ?? "2000");

  return {
    rpcUrl,
    agentPrivateKey,
    hookAddress: hookAddress as `0x${string}`,
    pollIntervalMs,
  };
}
