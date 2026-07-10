/**
 * ChronX transaction and RPC types
 *
 * Based on node v9.5.0 transaction format and RPC interface
 */

export interface ChronxTransaction {
  tx_version: number;
  parents: string[];  // 1-8 DAG tips (32-byte hex)
  timestamp: number;  // Unix timestamp in seconds
  nonce: number;      // Per-account monotonic nonce
  from: string;       // Base58 wallet address
  actions: ChronxAction[];
  auth_scheme: string;  // "dilithium2"
  signature: string;    // Dilithium2 signature (hex)
  pow_nonce: number;    // Proof-of-work nonce
}

export type ChronxAction =
  | GrantCreateAction
  | GrantArmAction
  | GrantAcceptAction
  | GrantEvaluateAction
  | GrantCloseAction;

export interface GrantCreateAction {
  type: "GrantCreate";
  grant_id: string;  // 32-byte BLAKE3 hex
  grantor_legal_identity: string;  // e.g., "Upon Proof LLC, Delaware"
  grantee_seat: string | null;  // null for open acceptance
  pool_kx: string;  // Whole KX units (string to preserve precision)
  expiry_ts: number;
  metric_spec: MetricSpec;
  payout_curve: PayoutCurve;
  window_spec: WindowSpec;
  unearned_rollover: boolean;
}

export interface GrantArmAction {
  type: "GrantArm";
  grant_id: string;
}

export interface GrantAcceptAction {
  type: "GrantAccept";
  grant_id: string;
  accepting_seat: string;
}

export interface GrantEvaluateAction {
  type: "GrantEvaluate";
  grant_id: string;
  window_index: number;
}

export interface GrantCloseAction {
  type: "GrantClose";
  grant_id: string;
}

export interface MetricSpec {
  class: "A" | "B";
  n_of_m?: number;
  witness_seat?: string;
  spec_plaintext?: string;
  evidence_hash_required: boolean;
}

export interface PayoutCurve {
  type: "stepped";
  steps: Array<[number, number]>;  // [[metric_threshold, payout_kx], ...]
}

export interface WindowSpec {
  window_len: number;  // seconds
  window_cap_kx: string;
  threshold: number;
  renews_until: number;
}

// RPC method parameters
export interface ChronxGetAccountParams {
  address: string;  // Base58 wallet address
}

export interface ChronxGetAccountResult {
  address: string;
  balance: string;
  nonce: number;
  exists: boolean;
}

export interface ChronxGetDagTipsParams {
  count?: number;  // Default 8, max 8
}

export interface ChronxGetDagTipsResult {
  tips: string[];  // Array of 32-byte hex transaction hashes
}

export interface ChronxSendTransactionParams {
  tx_hex: string;  // Hex-encoded bincode-serialized transaction
}

export interface ChronxSendTransactionResult {
  tx_hash: string;
  accepted: boolean;
}

export interface ChronxGetAuthorityGrantsParams {
  wallet: string;  // Base58 address
}

export interface ChronxGetAuthorityGrantsResult {
  grants: GrantSummary[];
}

export interface GrantSummary {
  grant_id: string;
  status: "DRAFT" | "ACTIVE" | "CLOSED" | "REVERTED";
  grantor_seat: string;
  grantee_seat: string | null;
  pool_kx: string;
  cumulative_released_kx: string;
  created_at: number;
  armed_at?: number;
  accepted_at?: number;
  closed_at?: number;
}

// Transaction signing context (pre-signature)
export interface TxSigningContext {
  tx_version: number;
  parents: string[];
  timestamp: number;
  nonce: number;
  from: string;
  actions: ChronxAction[];
  auth_scheme: string;
}
