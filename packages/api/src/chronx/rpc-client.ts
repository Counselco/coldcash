/**
 * ChronX RPC client
 *
 * Provides methods to interact with ChronX node RPC endpoints.
 * All live submissions are gated by CHRONX_LIVE_SUBMIT env flag.
 */

import type {
  ChronxGetAccountParams,
  ChronxGetAccountResult,
  ChronxGetDagTipsParams,
  ChronxGetDagTipsResult,
  ChronxSendTransactionParams,
  ChronxSendTransactionResult,
  ChronxGetAuthorityGrantsParams,
  ChronxGetAuthorityGrantsResult,
  ChronxTransaction,
} from "./types.js";
import {
  serializeTransaction,
  validateTransaction,
  isLiveSubmitEnabled,
} from "./tx-builder.js";

export interface ChronxRpcConfig {
  rpcUrl: string;  // e.g., "http://100.x.x.x:9545" (Tailscale mesh)
  timeout?: number;  // Request timeout in ms (default: 30000)
}

/**
 * ChronX RPC client
 *
 * SAFETY INTERLOCK:
 * - chronx_sendTransaction is GATED by CHRONX_LIVE_SUBMIT env flag
 * - When disabled (default), transactions are constructed and logged but NOT submitted
 * - All other RPC methods (queries) are unrestricted
 */
export class ChronxRpcClient {
  private config: ChronxRpcConfig;
  private requestId: number = 0;

  constructor(config: ChronxRpcConfig) {
    this.config = {
      timeout: 30000,
      ...config,
    };
  }

  /**
   * Get account state (balance, nonce)
   */
  async getAccount(params: ChronxGetAccountParams): Promise<ChronxGetAccountResult> {
    return this.call<ChronxGetAccountResult>("chronx_getAccount", params);
  }

  /**
   * Get current DAG tips for parent selection
   *
   * Returns 1-8 DAG tips. On a fresh chain (empty DAG), this may return an empty array.
   */
  async getDagTips(params?: ChronxGetDagTipsParams): Promise<ChronxGetDagTipsResult> {
    return this.call<ChronxGetDagTipsResult>("chronx_getDagTips", params || { count: 8 });
  }

  /**
   * Submit a transaction to the network
   *
   * SAFETY INTERLOCK:
   * - If CHRONX_LIVE_SUBMIT is false/unset: logs the hex payload and returns a mock response
   * - If CHRONX_LIVE_SUBMIT is true: submits the transaction to the live network
   *
   * The FIRST real transaction permanently retires the rollback window (to checkpoint b629e31f).
   * This must be a conscious operator act, NEVER a side effect of a build or test.
   *
   * @param tx - Signed and validated transaction
   * @returns Transaction hash and acceptance status
   */
  async sendTransaction(tx: ChronxTransaction): Promise<ChronxSendTransactionResult> {
    // Validate transaction structure
    validateTransaction(tx);

    // Serialize to hex
    const tx_hex = serializeTransaction(tx);

    // SAFETY GATE: Check if live submission is enabled
    if (!isLiveSubmitEnabled()) {
      console.log("╔═══════════════════════════════════════════════════════════════════╗");
      console.log("║                      DRY RUN MODE (SAFE)                          ║");
      console.log("╠═══════════════════════════════════════════════════════════════════╣");
      console.log("║ CHRONX_LIVE_SUBMIT is not enabled.                               ║");
      console.log("║ Transaction constructed and validated but NOT submitted.          ║");
      console.log("║                                                                   ║");
      console.log("║ To enable LIVE submission (PERMANENTLY RETIRES ROLLBACK WINDOW):  ║");
      console.log("║   export CHRONX_LIVE_SUBMIT=true                                  ║");
      console.log("║                                                                   ║");
      console.log("║ This should ONLY be done by an operator after conscious decision ║");
      console.log("║ to retire the rollback window and send the first probe tx.       ║");
      console.log("╚═══════════════════════════════════════════════════════════════════╝");
      console.log("");
      console.log("Transaction payload (would submit):");
      console.log("  From:", tx.from);
      console.log("  Nonce:", tx.nonce);
      console.log("  Actions:", tx.actions.map(a => a.type).join(", "));
      console.log("  Parents:", tx.parents.length);
      console.log("  Hex payload:", tx_hex.slice(0, 100) + "...");
      console.log("");

      // Return a mock success response
      return {
        tx_hash: "0x" + "00".repeat(32),  // Mock tx hash
        accepted: false,  // Explicitly false to indicate dry run
      };
    }

    // LIVE SUBMISSION PATH
    console.warn("⚠️  LIVE SUBMISSION ENABLED - Submitting transaction to ChronX network");
    console.warn("⚠️  This may permanently retire the rollback window if this is the first tx");

    const params: ChronxSendTransactionParams = { tx_hex };
    return this.call<ChronxSendTransactionResult>("chronx_sendTransaction", params);
  }

  /**
   * Get grants where the given wallet is grantor or grantee
   *
   * This is the primary dashboard query for /status page rendering.
   */
  async getAuthorityGrants(
    params: ChronxGetAuthorityGrantsParams
  ): Promise<ChronxGetAuthorityGrantsResult> {
    return this.call<ChronxGetAuthorityGrantsResult>("chronx_getAuthorityGrants", params);
  }

  /**
   * Make a JSON-RPC call to the ChronX node
   */
  private async call<T>(method: string, params: unknown): Promise<T> {
    const id = ++this.requestId;
    const payload = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(this.config.rpcUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`RPC request failed: ${response.status} ${response.statusText}`);
      }

      const result: any = await response.json();

      if (result.error) {
        throw new Error(`RPC error: ${result.error.message} (code: ${result.error.code})`);
      }

      return result.result as T;
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`RPC request timeout after ${this.config.timeout}ms`);
      }
      throw error;
    }
  }
}

/**
 * Create a mock RPC client for testing
 *
 * Returns canned responses suitable for dry-run/test mode.
 * Does NOT require a reachable ChronX node.
 */
export class MockChronxRpcClient extends ChronxRpcClient {
  private mockNonce: number = 0;
  private mockGrants: Map<string, any> = new Map();
  private dagTipCallCount: number = 0;

  constructor() {
    super({ rpcUrl: "mock://localhost" });
  }

  async getAccount(params: ChronxGetAccountParams): Promise<ChronxGetAccountResult> {
    return {
      address: params.address,
      balance: "1000000",  // Mock 1M KX balance
      nonce: this.mockNonce,
      exists: true,
    };
  }

  async getDagTips(params?: ChronxGetDagTipsParams): Promise<ChronxGetDagTipsResult> {
    // Simulate both empty DAG (fresh chain) and normal case
    const count = params?.count || 8;

    // Return empty tips for the first call (simulates fresh chain)
    // Then return mock tips for subsequent calls
    this.dagTipCallCount++;
    if (this.dagTipCallCount === 1) {
      return { tips: [] };
    }

    // Generate mock tips
    const tips = Array.from({ length: Math.min(count, 8) }, (_, i) =>
      "0x" + (i + 1).toString(16).padStart(64, "0")
    );
    return { tips };
  }

  async sendTransaction(tx: ChronxTransaction): Promise<ChronxSendTransactionResult> {
    validateTransaction(tx);
    this.mockNonce++;

    // Store grant actions for getAuthorityGrants
    for (const action of tx.actions) {
      if (action.type === "GrantCreate") {
        this.mockGrants.set(action.grant_id, {
          grant_id: action.grant_id,
          status: "DRAFT",
          grantor_seat: tx.from,
          grantee_seat: action.grantee_seat,
          pool_kx: action.pool_kx,
          cumulative_released_kx: "0",
          created_at: tx.timestamp,
        });
      } else if (action.type === "GrantArm") {
        const grant = this.mockGrants.get(action.grant_id);
        if (grant) {
          grant.status = "ACTIVE";
          grant.armed_at = tx.timestamp;
        }
      } else if (action.type === "GrantClose") {
        const grant = this.mockGrants.get(action.grant_id);
        if (grant) {
          grant.status = "CLOSED";
          grant.closed_at = tx.timestamp;
        }
      }
    }

    return {
      tx_hash: "0x" + Buffer.from(tx.from + tx.nonce.toString()).toString("hex").padEnd(64, "0"),
      accepted: true,
    };
  }

  async getAuthorityGrants(
    params: ChronxGetAuthorityGrantsParams
  ): Promise<ChronxGetAuthorityGrantsResult> {
    const grants = Array.from(this.mockGrants.values()).filter(
      g => g.grantor_seat === params.wallet || g.grantee_seat === params.wallet
    );
    return { grants };
  }
}
