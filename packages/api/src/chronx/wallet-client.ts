/**
 * ChronX Wallet Client - Subprocess invocation for signing and submission
 *
 * ARCHITECTURE RULING:
 * - TypeScript NEVER signs against this chain
 * - The chronx-wallet binary (compiled from the same crates the node verifies with) is the ONLY signer
 * - TypeScript constructs INTENT (grant action + parameters as structured data)
 * - Wallet binary signs (Dilithium2), does PoW, builds bincode body, and submits via node
 * - TypeScript gets back a TxId
 *
 * SAFETY INTERLOCK:
 * - Wallet submit invocation is gated behind CHRONX_LIVE_SUBMIT (default false)
 * - When unset: construct wallet command and LOG it (redacting secrets), but do NOT execute
 * - The first real tx permanently retires the rollback window; flipping the flag is an operator act
 *
 * PENDING: The exact wallet CLI grant-action invocation spec is being produced in docs/coldcash/SIGNING.md
 * Once that lands, replace PENDING-SIGNING-SPEC markers below with the exact command format.
 */

import { spawn } from "child_process";

export interface WalletConfig {
  walletBinPath: string;  // Path to chronx-wallet binary (from env CHRONX_WALLET_BIN)
  keyfilePath: string;    // Path to keyfile for Upon Proof company account dD8X...
}

export interface GrantCreateIntent {
  grant_id: string;
  grantor_legal_identity: string;
  grantee_seat: string | null;
  pool_kx: string;
  expiry_ts: number;
  metric_spec: {
    class: "A" | "B";
    n_of_m: number;
    witness_seat: string;
    spec_plaintext: string;
    evidence_hash_required: boolean;
  };
  payout_curve: {
    type: "stepped";
    steps: [number, number][];
  };
  window_spec: {
    window_len: number;
    window_cap_kx: string;
    threshold: number;
    renews_until: number;
  };
  unearned_rollover: boolean;
}

export interface GrantArmIntent {
  grant_id: string;
}

export interface GrantCloseIntent {
  grant_id: string;
}

export interface GrantAcceptIntent {
  grant_id: string;
  accepting_seat: string;
}

export interface GrantEvaluateIntent {
  grant_id: string;
  window_index: number;
}

export type GrantIntent =
  | { type: "GrantCreate"; intent: GrantCreateIntent }
  | { type: "GrantArm"; intent: GrantArmIntent }
  | { type: "GrantClose"; intent: GrantCloseIntent }
  | { type: "GrantAccept"; intent: GrantAcceptIntent }
  | { type: "GrantEvaluate"; intent: GrantEvaluateIntent };

export interface WalletSubmitResult {
  tx_id: string;
  submitted: boolean;  // false in dry-run mode
}

/**
 * ChronX Wallet Client
 *
 * Shells out to chronx-wallet binary for signing + PoW + submission.
 * TypeScript only constructs the grant INTENT — the wallet does the crypto.
 */
export class ChronxWalletClient {
  private config: WalletConfig;

  constructor(config: WalletConfig) {
    this.config = config;
  }

  /**
   * Submit a grant action via the wallet binary
   *
   * SAFETY INTERLOCK:
   * - If CHRONX_LIVE_SUBMIT is false/unset: logs the command and returns mock response
   * - If CHRONX_LIVE_SUBMIT is true: executes the wallet binary
   *
   * PENDING-SIGNING-SPEC: The exact wallet command format is being documented in docs/coldcash/SIGNING.md
   * This implementation builds the expected command structure but needs the spec to finalize.
   *
   * Expected command format (PENDING final spec):
   *   chronx-wallet grant-action \
   *     --keyfile <path> \
   *     --action <create|arm|close|accept|evaluate> \
   *     --grant-id <hex> \
   *     [action-specific args...]
   *
   * @param intents - One or more grant intents to submit atomically
   * @returns Transaction ID from wallet stdout
   */
  async submitGrantActions(intents: GrantIntent[]): Promise<WalletSubmitResult> {
    // PENDING-SIGNING-SPEC: Build wallet command from SIGNING.md spec
    // For now, construct the expected command structure
    const args = [
      "grant-action",
      "--keyfile", this.config.keyfilePath,
    ];

    // Add each intent as action args
    for (const intent of intents) {
      switch (intent.type) {
        case "GrantCreate":
          args.push("--action", "create");
          args.push("--grant-id", intent.intent.grant_id);
          args.push("--pool-kx", intent.intent.pool_kx);
          args.push("--expiry-ts", intent.intent.expiry_ts.toString());
          // TODO: Add remaining GrantCreate fields per SIGNING.md spec
          break;

        case "GrantArm":
          args.push("--action", "arm");
          args.push("--grant-id", intent.intent.grant_id);
          break;

        case "GrantClose":
          args.push("--action", "close");
          args.push("--grant-id", intent.intent.grant_id);
          break;

        case "GrantAccept":
          args.push("--action", "accept");
          args.push("--grant-id", intent.intent.grant_id);
          args.push("--accepting-seat", intent.intent.accepting_seat);
          break;

        case "GrantEvaluate":
          args.push("--action", "evaluate");
          args.push("--grant-id", intent.intent.grant_id);
          args.push("--window-index", intent.intent.window_index.toString());
          break;
      }
    }

    const command = this.config.walletBinPath;
    const commandDisplay = `${command} ${args.map(a => a.includes(this.config.keyfilePath) ? "<keyfile-redacted>" : a).join(" ")}`;

    // SAFETY GATE: Check if live submission is enabled
    if (!this.isLiveSubmitEnabled()) {
      console.log("╔═══════════════════════════════════════════════════════════════════╗");
      console.log("║                      DRY RUN MODE (SAFE)                          ║");
      console.log("╠═══════════════════════════════════════════════════════════════════╣");
      console.log("║ CHRONX_LIVE_SUBMIT is not enabled.                               ║");
      console.log("║ Wallet command constructed but NOT executed.                      ║");
      console.log("║                                                                   ║");
      console.log("║ To enable LIVE submission (PERMANENTLY RETIRES ROLLBACK WINDOW):  ║");
      console.log("║   export CHRONX_LIVE_SUBMIT=true                                  ║");
      console.log("║                                                                   ║");
      console.log("║ This should ONLY be done by an operator after conscious decision ║");
      console.log("║ to retire the rollback window and send the first probe tx.       ║");
      console.log("╚═══════════════════════════════════════════════════════════════════╝");
      console.log("");
      console.log("PENDING-SIGNING-SPEC: Wallet command (would execute):");
      console.log("  ", commandDisplay);
      console.log("");
      console.log("NOTE: This command format is PENDING finalization in docs/coldcash/SIGNING.md");
      console.log("");

      // Return mock response
      return {
        tx_id: "0x" + "00".repeat(32),  // Mock tx ID
        submitted: false,
      };
    }

    // LIVE SUBMISSION PATH
    console.warn("⚠️  LIVE SUBMISSION ENABLED - Executing wallet binary");
    console.warn("⚠️  This may permanently retire the rollback window if this is the first tx");
    console.warn("⚠️  Command:", commandDisplay);

    return this.executeWallet(command, args);
  }

  /**
   * Execute wallet binary and capture TxId from stdout
   *
   * PENDING-SIGNING-SPEC: This assumes the wallet binary:
   * - Signs the grant actions with Dilithium2
   * - Computes PoW
   * - Builds bincode transaction body
   * - Submits via node RPC
   * - Returns TxId on stdout (one line, hex string)
   * - Returns nonzero exit code on error
   *
   * @param command - Wallet binary path
   * @param args - Command arguments
   * @returns Transaction ID from wallet
   */
  private async executeWallet(command: string, args: string[]): Promise<WalletSubmitResult> {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args);

      let stdout = "";
      let stderr = "";

      process.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      process.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      process.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(
            `Wallet binary failed with exit code ${code}\n` +
            `stderr: ${stderr}\n` +
            `stdout: ${stdout}`
          ));
          return;
        }

        // PENDING-SIGNING-SPEC: Parse TxId from stdout
        // Expected format: single line with hex tx ID
        const tx_id = stdout.trim();
        if (!tx_id.match(/^(0x)?[0-9a-f]{64}$/i)) {
          reject(new Error(`Invalid TxId from wallet: ${tx_id}`));
          return;
        }

        resolve({
          tx_id: tx_id.startsWith("0x") ? tx_id : `0x${tx_id}`,
          submitted: true,
        });
      });

      process.on("error", (err) => {
        reject(new Error(`Failed to spawn wallet binary: ${err.message}`));
      });
    });
  }

  /**
   * Check if live submission is enabled
   *
   * SAFETY: This is the primary gate preventing accidental mainnet writes.
   * Default is DISABLED. Must be explicitly enabled by operator.
   */
  private isLiveSubmitEnabled(): boolean {
    return process.env.CHRONX_LIVE_SUBMIT === "true";
  }
}

/**
 * Create a wallet client from environment variables
 *
 * Required env vars:
 * - CHRONX_WALLET_BIN: Path to chronx-wallet binary
 * - CHRONX_KEYFILE: Path to keyfile for Upon Proof company account
 *
 * @returns Configured wallet client
 */
export function createWalletClientFromEnv(): ChronxWalletClient {
  const walletBinPath = process.env.CHRONX_WALLET_BIN || "chronx-wallet";
  const keyfilePath = process.env.CHRONX_KEYFILE;

  if (!keyfilePath) {
    throw new Error("CHRONX_KEYFILE environment variable is required");
  }

  return new ChronxWalletClient({
    walletBinPath,
    keyfilePath,
  });
}
