/**
 * ChronX Records Backend - On-Chain Implementation
 *
 * This replaces the records-first stub with genuine chain transactions for Type_G grants.
 *
 * SAFETY INTERLOCK:
 * - ALL live RPC submission is gated behind CHRONX_LIVE_SUBMIT env flag (default: false)
 * - When disabled: transactions are constructed, signed, validated, and logged but NOT submitted
 * - This gate is implemented in ChronxRpcClient.sendTransaction()
 *
 * IMPORTANT:
 * The ChronX chain is freshly genesis'd with an EMPTY DAG. The FIRST real transaction
 * permanently retires the rollback window (to checkpoint b629e31f). This must be a
 * conscious operator act, NEVER a side effect of a build or test.
 *
 * Flipping CHRONX_LIVE_SUBMIT=true is an operator decision made ONLY after:
 * 1. The rollback window is consciously retired
 * 2. The first probe tx is sent by hand
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
import { buildTransaction, generateGrantId } from "../chronx/tx-builder.js";
import type {
  GrantCreateAction,
  GrantArmAction,
  GrantCloseAction,
} from "../chronx/types.js";

export interface ChronxRecordsBackendConfig {
  rpcUrl: string;  // ChronX RPC endpoint (e.g., via Tailscale)
  grantorWallet: string;  // Upon Proof company wallet (base58 address)
  grantorPrivateKey: string | null;  // Dilithium2 private key (null for mock mode)
  grantorLegalIdentity: string;  // e.g., "Upon Proof LLC, Delaware"
  witnessIdentity: string;  // Witness seat for Class B metrics
  mock?: boolean;  // Use mock RPC client (for testing)
}

/**
 * ChronX Records Backend - Live On-Chain Implementation
 *
 * Implements SettlementBackend interface with real ChronX transactions.
 *
 * Transaction lifecycle:
 * 1. createPromise() → GrantCreate + GrantArm (debits pool from grantor)
 * 2. accept() → GrantAccept (binds grantee)
 * 3. resolve() → GrantEvaluate (permissionless, releases payout per curve)
 * 4. cancel/refund() → GrantClose (reverts unreleased pool to grantor)
 *
 * NOTE: Class A metrics are currently STUBBED at node level (return 0).
 * Grants ARM and lock funds but won't auto-release until J3 metric work lands.
 * Class B (github-merge) is also stubbed for now.
 */
export class ChronxRecordsBackend implements SettlementBackend {
  private config: ChronxRecordsBackendConfig;
  private rpc: ChronxRpcClient;

  constructor(config: ChronxRecordsBackendConfig) {
    this.config = config;
    this.rpc = config.mock
      ? new MockChronxRpcClient()
      : new ChronxRpcClient({ rpcUrl: config.rpcUrl });
  }

  /**
   * Create and arm a grant (atomic operation)
   *
   * Maps to:
   * 1. GrantCreate action (defines grant parameters)
   * 2. GrantArm action (debits pool_kx from grantor, seals schedule, moves to ACTIVE)
   *
   * @param params - Promise parameters (from intake)
   * @returns Promise reference (grant_id as address)
   */
  async createPromise(params: PromiseParams): Promise<PromiseRef> {
    // Get current account state for nonce
    const account = await this.rpc.getAccount({ address: this.config.grantorWallet });

    // Get DAG tips for parent selection
    const dagTips = await this.rpc.getDagTips({ count: 8 });

    // Generate grant ID
    const timestamp = Math.floor(Date.now() / 1000);
    const grant_id = generateGrantId(
      this.config.grantorWallet,
      params.namedSeeker || null,
      timestamp,
      account.nonce + 1
    );

    // Build GrantCreate action
    const createAction: GrantCreateAction = {
      type: "GrantCreate",
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

    // Build GrantArm action
    const armAction: GrantArmAction = {
      type: "GrantArm",
      grant_id,
    };

    // Build and submit transaction (gated by CHRONX_LIVE_SUBMIT)
    const tx = await buildTransaction(
      this.config.grantorWallet,
      [createAction, armAction],
      dagTips,
      account,
      this.config.grantorPrivateKey
    );

    const result = await this.rpc.sendTransaction(tx);

    console.log(`Grant created: ${grant_id} (tx: ${result.tx_hash})`);

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
   * NOTE: This implementation assumes the grantee signs the transaction.
   * In a real system, this would require the grantee's private key.
   * For now, we use the grantor's key (mock mode).
   */
  async accept(ref: PromiseRef, seeker: Address): Promise<TxRef> {
    const grant_id = ref.address;

    // Get account state
    const account = await this.rpc.getAccount({ address: this.config.grantorWallet });
    const dagTips = await this.rpc.getDagTips({ count: 8 });

    // In a real system, this would be signed by the grantee
    // For now, use grantor wallet (mock/test mode)
    const acceptAction = {
      type: "GrantAccept" as const,
      grant_id,
      accepting_seat: seeker,
    };

    const tx = await buildTransaction(
      this.config.grantorWallet,  // Should be grantee wallet
      [acceptAction],
      dagTips,
      account,
      this.config.grantorPrivateKey
    );

    const result = await this.rpc.sendTransaction(tx);

    return {
      chainId: 0,
      hash: result.tx_hash as Hex,
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

    // Get account state
    const account = await this.rpc.getAccount({ address: this.config.grantorWallet });
    const dagTips = await this.rpc.getDagTips({ count: 8 });

    // GrantEvaluate is permissionless - any wallet can submit
    const evaluateAction = {
      type: "GrantEvaluate" as const,
      grant_id,
      window_index: 0,  // First window (Type_G v1 is single-window)
    };

    const tx = await buildTransaction(
      this.config.grantorWallet,
      [evaluateAction],
      dagTips,
      account,
      this.config.grantorPrivateKey
    );

    const result = await this.rpc.sendTransaction(tx);

    return {
      chainId: 0,
      hash: result.tx_hash as Hex,
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

    // Get account state
    const account = await this.rpc.getAccount({ address: this.config.grantorWallet });
    const dagTips = await this.rpc.getDagTips({ count: 8 });

    const closeAction: GrantCloseAction = {
      type: "GrantClose",
      grant_id,
    };

    const tx = await buildTransaction(
      this.config.grantorWallet,
      [closeAction],
      dagTips,
      account,
      this.config.grantorPrivateKey
    );

    const result = await this.rpc.sendTransaction(tx);

    return {
      chainId: 0,
      hash: result.tx_hash as Hex,
    };
  }
}
