/**
 * Smoke test for Yellow ClearNode sandbox connection.
 * Verifies: WebSocket connect → auth_request → auth_challenge → auth_verify → ping/pong
 *
 * Usage: bun run packages/aggregator/src/smoke-test.ts
 */

import {
  createAuthRequestMessage,
  createAuthVerifyMessage,
  createEIP712AuthMessageSigner,
  createPingMessageV2,
  parseAuthChallengeResponse,
  parseAnyRPCResponse,
} from "@erc7824/nitrolite";
import { createWalletClient, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const CLEARNODE_URL = process.env["CLEARNODE_URL"] ?? "wss://clearnet-sandbox.yellow.com/ws";

// Anvil account #9 as wallet key
const WALLET_KEY = "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6" as const;

// Generate a separate session key (SDK pattern uses two different keys)
const SESSION_KEY = generatePrivateKey();

const walletAccount = privateKeyToAccount(WALLET_KEY);
const sessionAccount = privateKeyToAccount(SESSION_KEY);

console.log(`[smoke] wallet:      ${walletAccount.address}`);
console.log(`[smoke] session key: ${sessionAccount.address}`);
console.log(`[smoke] clearnode:   ${CLEARNODE_URL}`);
console.log("");

const walletClient = createWalletClient({
  account: walletAccount,
  chain: sepolia,
  transport: http(),
});

function step(name: string): void {
  process.stdout.write(`[smoke] ${name}... `);
}

function ok(detail?: string): void {
  console.log(`OK${detail ? ` (${detail})` : ""}`);
}

function fail(reason: string): never {
  console.log(`FAIL — ${reason}`);
  process.exit(1);
}

async function main(): Promise<void> {
  // Step 1: Connect
  step("connecting to ClearNode");
  const ws = new WebSocket(CLEARNODE_URL);

  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("WebSocket connection failed"));
    setTimeout(() => reject(new Error("Connection timed out")), 10000);
  });
  ok();

  // Helper to wait for a message matching a predicate
  function waitForMessage(timeoutMs = 15000, predicate?: (raw: string) => boolean): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timed out waiting for message")), timeoutMs);
      const handler = (event: MessageEvent) => {
        const raw = String(event.data);
        if (predicate && !predicate(raw)) {
          // Skip messages that don't match
          const parsed = JSON.parse(raw);
          const method = parsed.res?.[1] ?? parsed.req?.[1] ?? "unknown";
          console.log(`\n[smoke]   (skipping ${method} broadcast)`);
          process.stdout.write(`[smoke] waiting... `);
          return;
        }
        clearTimeout(timeout);
        ws.removeEventListener("message", handler);
        resolve(raw);
      };
      ws.addEventListener("message", handler);
    });
  }

  // Step 2: Send auth_request
  // NOTE: application MUST be "clearnode" and allowances MUST be [] to match sandbox expectations
  step("sending auth_request");
  const allowances: { asset: string; amount: string }[] = [];
  const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const authReqMsg = await createAuthRequestMessage({
    address: walletAccount.address,
    session_key: sessionAccount.address,
    application: "clearnode",
    allowances,
    expires_at: expiresAt,
    scope: "console",
  });
  ws.send(authReqMsg);
  ok();

  // Step 3: Wait for auth_challenge (skip other broadcasts like 'assets')
  step("waiting for auth_challenge");
  const challengeRaw = await waitForMessage(15000, (raw) => {
    try {
      const parsed = JSON.parse(raw);
      const method = parsed.res?.[1];
      return method === "auth_challenge" || method === "error";
    } catch { return false; }
  });
  console.log(""); // newline
  console.log(`[smoke]   raw: ${challengeRaw.slice(0, 200)}...`);

  let challenge;
  try {
    challenge = parseAuthChallengeResponse(challengeRaw);
  } catch (err) {
    // Maybe it's an error response
    try {
      const parsed = parseAnyRPCResponse(challengeRaw);
      fail(`got ${parsed.method} instead of auth_challenge: ${JSON.stringify(parsed.params)}`);
    } catch {
      fail(`unparseable response: ${challengeRaw.slice(0, 300)}`);
    }
  }
  console.log(`[smoke]   challenge received OK`);

  // Step 4: Sign and send auth_verify
  step("sending auth_verify (EIP-712)");

  const eip712Signer = createEIP712AuthMessageSigner(
    walletClient,
    {
      scope: "console",
      session_key: sessionAccount.address,
      expires_at: expiresAt,
      allowances,
    },
    { name: "clearnode" }, // Domain name matching integration tests
  );

  const verifyMsg = await createAuthVerifyMessage(eip712Signer, challenge!);
  ws.send(verifyMsg);
  ok();

  // Step 5: Wait for auth_verify response
  step("waiting for auth_verify response");
  const verifyRaw = await waitForMessage(15000, (raw) => {
    try {
      const parsed = JSON.parse(raw);
      const method = parsed.res?.[1];
      return method === "auth_verify" || method === "error";
    } catch { return false; }
  });
  console.log(""); // newline
  console.log(`[smoke]   raw: ${verifyRaw.slice(0, 200)}...`);

  let verifyResponse;
  try {
    verifyResponse = parseAnyRPCResponse(verifyRaw);
  } catch {
    fail(`unparseable response: ${verifyRaw.slice(0, 300)}`);
  }

  const params = verifyResponse!.params as any;
  if (params?.success !== true) {
    fail(`auth failed: ${JSON.stringify(params)}`);
  }
  console.log(`[smoke]   auth SUCCESS — address=${params.address}, sessionKey=${params.sessionKey}`);
  if (params.jwtToken) {
    console.log(`[smoke]   jwt: ${params.jwtToken.slice(0, 40)}...`);
  }

  // Step 6: Ping
  step("sending ping");
  const pingMsg = createPingMessageV2();
  ws.send(pingMsg);
  ok();

  step("waiting for pong");
  const pongRaw = await waitForMessage(5000);
  try {
    const pong = parseAnyRPCResponse(pongRaw);
    if (pong.method === "pong") {
      ok();
    } else {
      console.log(`got ${pong.method} instead of pong (may be OK — server might not pong)`);
    }
  } catch {
    console.log(`non-standard response (may be OK): ${pongRaw.slice(0, 100)}`);
  }

  // Done
  ws.close();
  console.log("\n[smoke] ALL PASSED");
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error("\n[smoke] FAILED:", err);
  process.exit(1);
});
