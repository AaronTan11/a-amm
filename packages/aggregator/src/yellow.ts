import {
  createAuthRequestMessage,
  createAuthVerifyMessage,
  createEIP712AuthMessageSigner,
  createECDSAMessageSigner,
  createAppSessionMessage,
  createApplicationMessage,
  createPingMessageV2,
  parseAnyRPCResponse,
  parseAuthChallengeResponse,
  RPCProtocolVersion,
} from "@erc7824/nitrolite";
import type {
  RPCAllowance,
  RPCAppDefinition,
  RPCAppSessionAllocation,
} from "@erc7824/nitrolite";
import {
  createWalletClient,
  http,
  type Hex,
  type Address,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import type { YellowMessage } from "./types.ts";

const APPLICATION_NAME = "a-amm-quotes";

/** Manages ClearNode WebSocket connection, auth, and messaging */
export class YellowConnection {
  private ws: WebSocket | null = null;
  private sessionSigner: ReturnType<typeof createECDSAMessageSigner>;
  private walletClient: WalletClient;
  private sessionKeyAddress: Address;
  private walletAddress: Address;
  private pendingResponses = new Map<number, {
    resolve: (data: any) => void;
    reject: (err: Error) => void;
  }>();
  private messageHandlers: ((msg: any) => void)[] = [];
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    privateKey: Hex,
    private clearNodeUrl: string,
  ) {
    const account = privateKeyToAccount(privateKey);
    this.walletAddress = account.address;

    // For hackathon simplicity, use the same key as both wallet and session key
    this.sessionKeyAddress = account.address;
    this.sessionSigner = createECDSAMessageSigner(privateKey);
    this.walletClient = createWalletClient({
      account,
      chain: sepolia,
      transport: http(),
    });
  }

  get address(): Address {
    return this.walletAddress;
  }

  /** Connect to ClearNode and authenticate */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.clearNodeUrl);

      this.ws.onopen = async () => {
        console.log("[yellow] connected to ClearNode");
        try {
          await this.authenticate();
          this.startPingLoop();
          resolve();
        } catch (err) {
          reject(err);
        }
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(String(event.data));
      };

      this.ws.onerror = (event) => {
        console.error("[yellow] WebSocket error:", event);
        reject(new Error("WebSocket connection failed"));
      };

      this.ws.onclose = () => {
        console.log("[yellow] disconnected from ClearNode");
        this.stopPingLoop();
      };
    });
  }

  /** Register a handler for incoming app session messages */
  onMessage(handler: (msg: any) => void): void {
    this.messageHandlers.push(handler);
  }

  /** Send a message via the app session */
  async sendAppMessage(appSessionId: Hex, message: YellowMessage): Promise<void> {
    const msg = await createApplicationMessage(
      this.sessionSigner,
      appSessionId,
      message,
    );
    this.send(msg);
  }

  /** Create an app session for quote coordination */
  async createAppSession(
    participants: Address[],
    allocations: RPCAppSessionAllocation[],
  ): Promise<Hex> {
    const definition: RPCAppDefinition = {
      application: APPLICATION_NAME,
      protocol: RPCProtocolVersion.NitroRPC_0_4,
      participants: participants as Hex[],
      weights: participants.map(() => 1),
      quorum: 1, // aggregator can operate unilaterally
      challenge: 86400, // 1 day challenge period
    };

    const msg = await createAppSessionMessage(this.sessionSigner, {
      definition,
      allocations,
    });

    const response = await this.sendAndWait(msg);
    const appSessionId = response.params?.appSessionId;
    if (!appSessionId) {
      throw new Error("Failed to create app session — no appSessionId in response");
    }

    console.log(`[yellow] created app session: ${appSessionId}`);
    return appSessionId as Hex;
  }

  /** Close the WebSocket connection */
  disconnect(): void {
    this.stopPingLoop();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // --- Private ---

  private async authenticate(): Promise<void> {
    console.log("[yellow] authenticating...");

    // Step 1: Send auth_request (public, no signature needed)
    const allowances: RPCAllowance[] = [{ asset: "usdc", amount: "0" }];
    const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 86400); // 24h

    const authReqMsg = await createAuthRequestMessage({
      address: this.walletAddress,
      session_key: this.sessionKeyAddress,
      application: APPLICATION_NAME,
      allowances,
      expires_at: expiresAt,
      scope: "app.create",
    });
    this.send(authReqMsg);

    // Step 2: Wait for auth_challenge response
    const challengeRaw = await this.waitForMethod("auth_challenge");
    const challenge = parseAuthChallengeResponse(challengeRaw);
    console.log("[yellow] received auth challenge");

    // Step 3: Create EIP-712 signer and send auth_verify
    const eip712Signer = createEIP712AuthMessageSigner(
      this.walletClient,
      {
        scope: "app.create",
        session_key: this.sessionKeyAddress,
        expires_at: expiresAt,
        allowances,
      },
      { name: "Clearnet" },
    );

    const verifyMsg = await createAuthVerifyMessage(eip712Signer, challenge);
    this.send(verifyMsg);

    // Step 4: Wait for auth_verify response
    const verifyRaw = await this.waitForMethod("auth_verify");
    const verifyResponse = parseAnyRPCResponse(verifyRaw);
    if (!(verifyResponse.params as any)?.success) {
      throw new Error("Authentication failed");
    }

    console.log("[yellow] authenticated successfully");
  }

  private send(msg: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected");
    }
    this.ws.send(msg);
  }

  private async sendAndWait(msg: string): Promise<any> {
    // Extract requestId from the message
    const parsed = JSON.parse(msg);
    const requestId = parsed.req?.[0] ?? parsed.res?.[0];

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingResponses.delete(requestId);
        reject(new Error(`Request ${requestId} timed out`));
      }, 15000);

      this.pendingResponses.set(requestId, {
        resolve: (data) => {
          clearTimeout(timeout);
          resolve(data);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });

      this.send(msg);
    });
  }

  private waitForMethod(method: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timed out waiting for ${method}`));
      }, 15000);

      const handler = (raw: string) => {
        try {
          const parsed = JSON.parse(raw);
          const msgMethod = parsed.res?.[1] ?? parsed.req?.[1];
          if (msgMethod === method) {
            clearTimeout(timeout);
            // Remove this handler
            const idx = this.messageHandlers.indexOf(handler);
            if (idx >= 0) this.messageHandlers.splice(idx, 1);
            resolve(raw);
          }
        } catch {
          // Not valid JSON, ignore
        }
      };

      this.messageHandlers.push(handler);
    });
  }

  private handleMessage(raw: string): void {
    try {
      const parsed = JSON.parse(raw);

      // Check if this is a response to a pending request
      const requestId = parsed.res?.[0];
      if (requestId !== undefined && this.pendingResponses.has(requestId)) {
        const pending = this.pendingResponses.get(requestId)!;
        this.pendingResponses.delete(requestId);
        try {
          const response = parseAnyRPCResponse(raw);
          pending.resolve(response);
        } catch (err) {
          pending.reject(err instanceof Error ? err : new Error(String(err)));
        }
        return;
      }
    } catch {
      // Not valid JSON, pass through
    }

    // Dispatch to all registered handlers
    for (const handler of this.messageHandlers) {
      try {
        handler(raw);
      } catch (err) {
        console.error("[yellow] message handler error:", err);
      }
    }
  }

  private startPingLoop(): void {
    this.pingInterval = setInterval(() => {
      try {
        const ping = createPingMessageV2();
        this.send(ping);
      } catch {
        // Connection might be closed
      }
    }, 30000);
  }

  private stopPingLoop(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}
