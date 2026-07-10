/**
 * ChronX Records Backend - On-Chain Implementation
 *
 * ARCHITECTURE: WRITES-THROUGH-WALLET / READS-THROUGH-RPC
 *
 * WRITES (GrantCreate, GrantArm, GrantClose, GrantEvaluate):
 * - TypeScript constructs the grant INTENT (action + parameters as structured data)
 * - Shells out to chronx-wallet binary which:
 *   - Signs with Dilithium2
 *   - Computes PoW
 *   - Builds bincode body
 *   - Submits via node
 * - TypeScript gets back a TxId
 * - TypeScript does NOT sign, does NOT PoW, does NOT construct bincode
 *
 * READS (dashboard/status):
 * - JSON-RPC calls to chronx_getAuthorityGrants, chronx_getAccount, chronx_getDagTips
 * - Unchanged from previous implementation
 *
 * SAFETY INTERLOCK:
 * - ALL live wallet submission is gated behind CHRONX_LIVE_SUBMIT env flag (default: false)
 * - When disabled: wallet command constructed and logged but NOT executed
 * - The first real tx permanently retires the rollback window (to checkpoint b629e31f)
 * - Flipping CHRONX_LIVE_SUBMIT=true is an operator decision made ONLY after:
 *   1. The rollback window is consciously retired
 *   2. The first probe tx is sent by hand
 */

import type {
  SettlementBackend,
  PromiseParams,
  PromiseRef,
  PromiseState,
  TxRef,
  Address,
  Hex,
} from "@coldcash/shared";
import { ChronxRpcClient, MockChronxRpcClient } from "../chronx/rpc-client.js";
import { generateGrantId } from "../chronx/tx-builder.js";
import {
  ChronxWalletClient,
  type GrantIntent,
  type GrantCreateIntent,
  type GrantArmIntent,
  type GrantCloseIntent,
} from "../chronx/wallet-client.js";

export interface ChronxRecordsBackendConfig {
  rpcUrl: string;  // ChronX RPC endpoint (e.g., via Tailscale)
  grantorWallet: string;  // Upon Proof company wallet (base58 address)
  grantorLegalIdentity: string;  // e.g., "Upon Proof LLC, Delaware"
  witnessIdentity: string;  // Witness seat for Class B metrics
  walletBinPath?: string;  // Path to chronx-wallet binary (default: from env CHRONX_WALLET_BIN)
  keyfilePath?: string;  // Path to keyfile (default: from env CHRONX_KEYFILE)
  mock?: boolean;  // Use mock wallet client (for testing)
}

/**
 * ChronX Records Backend - Live On-Chain Implementation
 *
 * Implements SettlementBackend interface with real ChronX transactions.
 *
 * Transaction lifecycle:
 * 1. createPromise() → GrantCreate + GrantArm (wallet signs + submits)
 * 2. accept() → GrantAccept (wallet signs + submits)
 * 3. resolve() → GrantEvaluate (wallet signs + submits, permissionless)
 * 4. cancel/refund() → GrantClose (wallet signs + submits)
 *
 * NOTE: Class A metrics are currently STUBBED at node level (return 0).
 * Grants ARM and lock funds but won't auto-release until J3 metric work lands.
 * Class B (github-merge) is also stubbed for now.
 */
export class ChronxRecordsBackend implements SettlementBackend {
  private config: ChronxRecordsBackendConfig;
  private rpc: ChronxRpcClient;
  private wallet: ChronxWalletClient | null;

  constructor(config: ChronxRecordsBackendConfig) {
    this.config = config;
    this.rpc = config.mock
      ? new MockChronxRpcClient()
      : new ChronxRpcClient({ rpcUrl: config.rpcUrl });

    // Initialize wallet client (null in mock mode)
    if (config.mock) {
      this.wallet = null;
    } else {
      const walletBinPath = config.walletBinPath || process.env.CHRONX_WALLET_BIN || "chronx-wallet";
      const keyfilePath = config.keyfilePath || process.env.CHRONX_KEYFILE;

      if (!keyfilePath) {
        throw new Error("CHRONX_KEYFILE environment variable or config.keyfilePath is required");
      }

      this.wallet = new ChronxWalletClient({
        walletBinPath,
        keyfilePath,
      });
    }
  }

  /**
   * Create and arm a grant (atomic operation)
   *
   * Maps to:
   * 1. GrantCreate action (defines grant parameters)
   * 2. GrantArm action (debits pool_kx from grantor, seals schedule, moves to ACTIVE)
   *
   * WRITES-THROUGH-WALLET: Constructs grant INTENT, shells out to chronx-wallet binary
   * for signing + PoW + bincode + submission. TypeScript does NOT sign.
   *
   * @param params - Promise parameters (from intake)
   * @returns Promise reference (grant_id as address)
   */
  async createPromise(params: PromiseParams): Promise<PromiseRef> {
    // Get current account state for nonce (used for grant_id derivation)
    const account = await this.rpc.getAccount({ address: this.config.grantorWallet });

    // Generate grant ID
    // PENDING-SIGNING-SPEC: If SIGNING.md says wallet generates grant_id, call wallet for this too
    const timestamp = Math.floor(Date.now() / 1000);
    const grant_id = generateGrantId(
      this.config.grantorWallet,
      params.namedSeeker || null,
      timestamp,
      account.nonce + 1
    );

    // Build GrantCreate intent
    const createIntent: GrantCreateIntent = {
      grant_id,
      grantor_legal_identity: this.config.grantorLegalIdentity,
      grantee_seat: params.namedSeeker || null,
      pool_kx: params.prize.toString(),  // Whole KX units
      expiry_ts: params.deadline,
      metric_spec: {
        class: "B",  // Class B for now (github-merge)
        n_of_m: 1,
        witness_seat: this.config.witnessIdentity,
        spec_plaintext: params.standardHash,
        evidence_hash_required: true,
      },
      payout_curve: {
        type: "stepped",
        steps: [[1, Number(params.prize)]],  // Binary: 1 → full payout, 0 → zero
      },
      window_spec: {
        window_len: params.deadline - params.acceptBy,
        window_cap_kx: params.prize.toString(),
        threshold: 1,
        renews_until: params.deadline,
      },
      unearned_rollover: false,
    };

    // Build GrantArm intent
    const armIntent: GrantArmIntent = {
      grant_id,
    };

    // Submit via wallet binary (or mock in test mode)
    const intents: GrantIntent[] = [
      { type: "GrantCreate", intent: createIntent },
      { type: "GrantArm", intent: armIntent },
    ];

    let tx_id: string;
    if (this.config.mock) {
      // Mock mode: simulate wallet response and register grant in mock RPC for status queries
      tx_id = "0x" + Buffer.from(grant_id).toString("hex").slice(0, 64).padEnd(64, "0");
      console.log(`[MOCK] Grant created: ${grant_id} (tx: ${tx_id})`);

      // Register grant in mock RPC client so status() can query it
      if (this.rpc instanceof MockChronxRpcClient) {
        this.rpc.registerMockGrant(
          grant_id,
          this.config.grantorWallet,
          params.namedSeeker || null,
          params.prize.toString(),
          "ACTIVE"  // GrantCreate + GrantArm → ACTIVE
        );
      }
    } else {
      // Live mode: shell out to wallet binary (gated by CHRONX_LIVE_SUBMIT)
      const result = await this.wallet!.submitGrantActions(intents);
      tx_id = result.tx_id;
      console.log(`Grant created: ${grant_id} (tx: ${tx_id}, submitted: ${result.submitted})`);
    }

    return {
      chainId: 0,  // ChronX chain ID (TBD)
      address: grant_id as Address,
      asset: "KX",
    };
  }

  /**
   * Cancel a grant (before acceptance)
   *
   * Maps to: GrantClose action (reverts pool to grantor)
   *
   * NOTE: This is NOT the same as cancel() in the SettlementBackend interface.
   * In the interface, cancel() is called pre-acceptance (lapse).
   * GrantClose is permissionless and idempotent (can be called post-expiry).
   */
  async cancel(ref: PromiseRef): Promise<TxRef> {
    return this.closeGrant(ref);
  }

  /**
   * Accept a grant (bind grantee)
   *
   * Maps to: GrantAccept action
   *
   * NOTE: In production, this would be signed by the grantee's wallet.
   * For now, we use the grantor's wallet (mock/test mode).
   */
  async accept(ref: PromiseRef, seeker: Address): Promise<TxRef> {
    const grant_id = ref.address;

    const intents: GrantIntent[] = [
      {
        type: "GrantAccept",
        intent: {
          grant_id,
          accepting_seat: seeker,
        },
      },
    ];

    let tx_id: string;
    if (this.config.mock) {
      // Mock mode: simulate wallet response
      tx_id = "0x" + Buffer.from(grant_id + "accept").toString("hex").slice(0, 64).padEnd(64, "0");
    } else {
      // Live mode: shell out to wallet binary
      const result = await this.wallet!.submitGrantActions(intents);
      tx_id = result.tx_id;
    }

    return {
      chainId: 0,
      hash: tx_id as Hex,
    };
  }

  /**
   * Resolve a grant window (evaluate metrics and release payout)
   *
   * Maps to: GrantEvaluate action
   *
   * NOTE: GrantEvaluate is permissionless and idempotent.
   * It checks N-of-M witness consensus, applies payout curve, and releases KX.
   *
   * Class A metrics are currently STUBBED (return 0) at node level.
   * Class B (github-merge) is also stubbed.
   * Payout will be zero until J3 metric work lands.
   */
  async resolve(ref: PromiseRef, bps: number, evidenceHash: Hex): Promise<TxRef> {
    const grant_id = ref.address;

    const intents: GrantIntent[] = [
      {
        type: "GrantEvaluate",
        intent: {
          grant_id,
          window_index: 0,  // First window (Type_G v1 is single-window)
        },
      },
    ];

    let tx_id: string;
    if (this.config.mock) {
      // Mock mode: simulate wallet response
      tx_id = "0x" + Buffer.from(grant_id + "evaluate").toString("hex").slice(0, 64).padEnd(64, "0");
    } else {
      // Live mode: shell out to wallet binary
      const result = await this.wallet!.submitGrantActions(intents);
      tx_id = result.tx_id;
    }

    return {
      chainId: 0,
      hash: tx_id as Hex,
    };
  }

  /**
   * Refund a grant (expiry revert)
   *
   * Maps to: GrantClose action
   */
  async refund(ref: PromiseRef): Promise<TxRef> {
    return this.closeGrant(ref);
  }

  /**
   * Get grant status
   *
   * Maps to: chronx_getAuthorityGrants RPC call
   *
   * NOTE: This assumes the node implements chronx_getAuthorityGrants.
   * If not available, we would need chronx_getGrant(grant_id) instead.
   */
  async status(ref: PromiseRef): Promise<PromiseState> {
    const grant_id = ref.address;

    // Query grants from node
    const result = await this.rpc.getAuthorityGrants({
      wallet: this.config.grantorWallet,
    });

    const grant = result.grants.find(g => g.grant_id === grant_id);
    if (!grant) {
      throw new Error(`Grant not found: ${grant_id}`);
    }

    // Map grant status to PromiseStatus
    let status: "Offered" | "Accepted" | "Paid" | "Refunded" | "Canceled";
    if (grant.status === "DRAFT") {
      status = "Offered";
    } else if (grant.status === "ACTIVE") {
      status = grant.grantee_seat ? "Accepted" : "Offered";
    } else if (grant.status === "CLOSED") {
      // Determine if paid or refunded based on cumulative_released_kx
      const released = BigInt(grant.cumulative_released_kx || "0");
      status = released > 0n ? "Paid" : "Refunded";
    } else {
      status = "Canceled";
    }

    // Calculate paidBps from cumulative_released_kx / pool_kx
    const released = BigInt(grant.cumulative_released_kx || "0");
    const pool = BigInt(grant.pool_kx);
    const paidBps = pool > 0n ? Number((released * 10000n) / pool) : 0;

    return {
      status,
      backer: this.config.grantorWallet as Address,
      seeker: grant.grantee_seat ? (grant.grantee_seat as Address) : undefined,
      prize: BigInt(grant.pool_kx),
      acceptBy: grant.created_at + 86400,  // Mock: 24h from creation
      deadline: grant.created_at + 172800,  // Mock: 48h from creation
      standardHash: "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex,  // Mock
      isPublic: false,
      paidBps: status === "Paid" ? paidBps : undefined,
    };
  }

  /**
   * Close a grant (GrantClose action)
   *
   * Private helper used by cancel() and refund().
   * GrantClose is permissionless and idempotent.
   */
  private async closeGrant(ref: PromiseRef): Promise<TxRef> {
    const grant_id = ref.address;

    const intents: GrantIntent[] = [
      {
        type: "GrantClose",
        intent: { grant_id },
      },
    ];

    let tx_id: string;
    if (this.config.mock) {
      // Mock mode: simulate wallet response
      tx_id = "0x" + Buffer.from(grant_id + "close").toString("hex").slice(0, 64).padEnd(64, "0");
    } else {
      // Live mode: shell out to wallet binary
      const result = await this.wallet!.submitGrantActions(intents);
      tx_id = result.tx_id;
    }

    return {
      chainId: 0,
      hash: tx_id as Hex,
    };
  }
}
