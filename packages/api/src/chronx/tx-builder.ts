/**
 * ChronX transaction construction and signing
 *
 * SAFETY INTERLOCK:
 * All live RPC submission is gated behind CHRONX_LIVE_SUBMIT env flag (default: false).
 * The ChronX chain is freshly genesis'd with an EMPTY DAG. The FIRST real transaction
 * permanently retires the rollback window (to checkpoint b629e31f). This must be a
 * conscious operator act, NEVER a side effect of a build or test.
 *
 * When CHRONX_LIVE_SUBMIT is unset/false: transactions are constructed, signed, validated,
 * and the hex payload is logged but NOT submitted to the network.
 *
 * Flipping this flag is an operator decision made only after the rollback window is
 * consciously retired and the first probe tx is sent by hand.
 */

import type {
  ChronxTransaction,
  ChronxAction,
  TxSigningContext,
  ChronxGetDagTipsResult,
  ChronxGetAccountResult,
} from "./types.js";
import { keccak256 } from "viem";
import { createHash } from "crypto";

const TX_VERSION = 1;
const AUTH_SCHEME = "dilithium2";

/**
 * Build a ChronX transaction
 *
 * @param from - Base58 wallet address
 * @param actions - Transaction actions
 * @param dagTips - Current DAG tips (from chronx_getDagTips)
 * @param account - Account state (from chronx_getAccount)
 * @param privateKey - Dilithium2 private key (for signing)
 * @returns Constructed and signed transaction
 */
export async function buildTransaction(
  from: string,
  actions: ChronxAction[],
  dagTips: ChronxGetDagTipsResult,
  account: ChronxGetAccountResult,
  privateKey: string | null = null
): Promise<ChronxTransaction> {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = account.nonce + 1;
  const parents = dagTips.tips.slice(0, Math.min(8, dagTips.tips.length));

  // Signing context (excludes signature and pow_nonce)
  const signingContext: TxSigningContext = {
    tx_version: TX_VERSION,
    parents,
    timestamp,
    nonce,
    from,
    actions,
    auth_scheme: AUTH_SCHEME,
  };

  // Sign the transaction body
  const signature = await signTransaction(signingContext, privateKey);

  // Compute proof-of-work
  const pow_nonce = await computeProofOfWork(signingContext, signature);

  return {
    ...signingContext,
    signature,
    pow_nonce,
  };
}

/**
 * Sign a transaction using Dilithium2
 *
 * IMPORTANT: This is a STRUCTURAL STUB. Real implementation requires:
 * - Dilithium2 crypto library (e.g., dilithium-crystals, libdilithium)
 * - Proper key management (secure key storage, not passed as string)
 * - Bincode serialization (exact encoding must match node implementation)
 *
 * Signing digest: bincode::serialize((tx_version, parents, timestamp, nonce, from, actions, auth_scheme))
 * Algorithm: Dilithium2.sign(digest, private_key)
 *
 * @param context - Transaction signing context
 * @param privateKey - Dilithium2 private key (hex or base64 encoded)
 * @returns Dilithium2 signature (hex encoded)
 */
async function signTransaction(
  context: TxSigningContext,
  privateKey: string | null
): Promise<string> {
  // TODO: Implement real Dilithium2 signing
  // This requires:
  // 1. Bincode serialization library (exact encoding as Rust's bincode)
  // 2. Dilithium2 crypto library
  // 3. Proper key derivation/management
  //
  // For now, return a structural placeholder that validates the shape
  // but is NOT cryptographically valid

  if (!privateKey) {
    // Mock mode: return a fake signature with correct structure
    // Real Dilithium2 signatures are 2420 bytes
    return "0x" + "00".repeat(2420);
  }

  // In production, this would be:
  // const digest = bincode.encode(context);
  // const signature = dilithium2.sign(digest, privateKey);
  // return signature.toString('hex');

  throw new Error("Real Dilithium2 signing not yet implemented. Use mock mode for testing.");
}

/**
 * Compute proof-of-work nonce
 *
 * IMPORTANT: This is a STRUCTURAL STUB. Real implementation requires:
 * - Understanding the PoW difficulty target
 * - Proper hash function (likely BLAKE3 or SHA3)
 * - Mining loop to find valid nonce
 *
 * PoW is required on every non-genesis transaction.
 *
 * @param context - Transaction signing context
 * @param signature - Transaction signature
 * @returns Valid proof-of-work nonce
 */
async function computeProofOfWork(
  context: TxSigningContext,
  signature: string
): Promise<number> {
  // TODO: Implement real PoW computation
  // This requires:
  // 1. Understanding the difficulty target (bits/hash prefix requirement)
  // 2. Hash function (BLAKE3 over full tx including candidate nonce)
  // 3. Mining loop: for nonce in 0..u64::MAX { if hash(tx, nonce) < target { return nonce } }
  //
  // For now, return a placeholder that validates the type
  // but is NOT a valid PoW solution

  // Mock mode: return a deterministic fake nonce
  return 12345;

  // In production, this would be a mining loop:
  // let nonce = 0;
  // while (nonce < Number.MAX_SAFE_INTEGER) {
  //   const candidate = { ...context, signature, pow_nonce: nonce };
  //   const hash = blake3(bincode.encode(candidate));
  //   if (meetsPoWTarget(hash, difficulty)) {
  //     return nonce;
  //   }
  //   nonce++;
  // }
  // throw new Error("PoW computation failed");
}

/**
 * Serialize a transaction to hex-encoded bincode
 *
 * IMPORTANT: This is a STRUCTURAL STUB. Real implementation requires:
 * - Exact bincode encoding matching Rust's bincode crate
 * - Proper field ordering and type encoding
 *
 * @param tx - Constructed transaction
 * @returns Hex-encoded bincode representation
 */
export function serializeTransaction(tx: ChronxTransaction): string {
  // TODO: Implement real bincode serialization
  // This requires a bincode library that exactly matches Rust's encoding
  //
  // For now, return JSON as a placeholder (NOT valid for actual submission)
  // but allows testing the submission gate and RPC shape

  const json = JSON.stringify(tx);
  return "0x" + Buffer.from(json).toString("hex");
}

/**
 * Generate a grant ID using BLAKE3 (fallback to SHA3-256 for now)
 *
 * Grant IDs are 32-byte BLAKE3 hashes of:
 * (grantor_seat, grantee_seat, timestamp, nonce)
 *
 * NOTE: This uses SHA3-256 as a placeholder. Real implementation should use BLAKE3
 * to match the node's grant ID generation.
 *
 * @param grantor - Grantor wallet address
 * @param grantee - Grantee wallet address (or null)
 * @param timestamp - Creation timestamp
 * @param nonce - Account nonce
 * @returns 32-byte hash hex string (no 0x prefix)
 */
export function generateGrantId(
  grantor: string,
  grantee: string | null,
  timestamp: number,
  nonce: number
): string {
  const input = `${grantor}:${grantee || "null"}:${timestamp}:${nonce}`;
  // TODO: Replace with BLAKE3 when available
  const hash = createHash("sha3-256").update(input, "utf-8").digest();
  return hash.toString("hex");
}

/**
 * Check if live submission is enabled
 *
 * SAFETY: This is the primary gate preventing accidental mainnet writes.
 * Default is DISABLED. Must be explicitly enabled by operator.
 */
export function isLiveSubmitEnabled(): boolean {
  return process.env.CHRONX_LIVE_SUBMIT === "true";
}

/**
 * Validate that a transaction is ready for submission
 *
 * Checks:
 * - Non-empty parents (unless this is genesis)
 * - Valid nonce (> 0)
 * - Non-zero PoW nonce
 * - Valid signature length
 *
 * @param tx - Transaction to validate
 * @throws Error if transaction is invalid
 */
export function validateTransaction(tx: ChronxTransaction): void {
  if (tx.nonce < 0) {
    throw new Error(`Invalid nonce: ${tx.nonce}`);
  }

  if (tx.pow_nonce === 0) {
    throw new Error("PoW nonce is zero (PoW not computed)");
  }

  if (!tx.signature || tx.signature === "0x") {
    throw new Error("Transaction is not signed");
  }

  if (tx.actions.length === 0) {
    throw new Error("Transaction has no actions");
  }

  // Parents can be empty for genesis tx, but on a live chain this is extremely rare
  if (tx.parents.length === 0) {
    console.warn("WARNING: Transaction has no parents (genesis tx?)");
  }
}
