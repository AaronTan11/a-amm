import {
  createAuthRequestMessage,
  createAuthVerifyMessage,
  createEIP712AuthMessageSigner,
  createECDSAMessageSigner,
  createApplicationMessage,
  createPingMessageV2,
  parseAnyRPCResponse,
  parseAuthChallengeResponse,
} from "@erc7824/nitrolite";
import type { RPCAllowance } from "@erc7824/nitrolite";
import {
  createWalletClient,
  http,
  type Hex,
  type Address,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const APPLICATION_NAME = "clearnode";

/** Manages ClearNode WebSocket connection, auth, and messaging for agents */
export class YellowConnection {
  private ws: WebSocket | null = null;
  private sessionSigner: ReturnType<typeof createECDSAMessageSigner>;
  private walletClient: WalletClient;
  private sessionKeyAddress: Address;
  private walletAddress: Address;
  private messageHandlers: ((msg: string) => void)[] = [];
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    privateKey: Hex,
    private clearNodeUrl: string,
  ) {
    const account = privateKeyToAccount(privateKey);
    this.walletAddress = account.address;
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
        const raw = String(event.data);
        for (const handler of this.messageHandlers) {
          try {
            handler(raw);
          } catch (err) {
            console.error("[yellow] handler error:", err);
          }
        }
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

  onMessage(handler: (raw: string) => void): void {
    this.messageHandlers.push(handler);
  }

  async sendAppMessage(appSessionId: Hex, message: any): Promise<void> {
    const msg = await createApplicationMessage(
      this.sessionSigner,
      appSessionId,
      message,
    );
    this.send(msg);
  }

  disconnect(): void {
    this.stopPingLoop();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private async authenticate(): Promise<void> {
    console.log("[yellow] authenticating...");

    const allowances: RPCAllowance[] = [];
    const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 86400);

    const authReqMsg = await createAuthRequestMessage({
      address: this.walletAddress,
      session_key: this.sessionKeyAddress,
      application: APPLICATION_NAME,
      allowances,
      expires_at: expiresAt,
      scope: "app.create",
    });
    this.send(authReqMsg);

    const challengeRaw = await this.waitForMethod("auth_challenge");
    const challenge = parseAuthChallengeResponse(challengeRaw);
    console.log("[yellow] received auth challenge");

    const eip712Signer = createEIP712AuthMessageSigner(
      this.walletClient,
      {
        scope: "app.create",
        session_key: this.sessionKeyAddress,
        expires_at: expiresAt,
        allowances,
      },
      { name: "clearnode" },
    );

    const verifyMsg = await createAuthVerifyMessage(eip712Signer, challenge);
    this.send(verifyMsg);

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
            const idx = this.messageHandlers.indexOf(handler);
            if (idx >= 0) this.messageHandlers.splice(idx, 1);
            resolve(raw);
          }
        } catch {
          // ignore
        }
      };

      this.messageHandlers.push(handler);
    });
  }

  private startPingLoop(): void {
    this.pingInterval = setInterval(() => {
      try {
        const ping = createPingMessageV2();
        this.send(ping);
      } catch {
        // connection might be closed
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
