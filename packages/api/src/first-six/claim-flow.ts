/**
 * First Six Claim Flow - FCFS by DAG Order
 *
 * Claim lifecycle:
 * 1. Operator submits claim intent (endpoint + bond + PoW)
 * 2. Claim-tx constructed via wallet-client (PENDING-SIGNING-SPEC path)
 * 3. FCFS ties resolved by DAG commit order of claim-txs
 * 4. Checks pass (seat open, node reachable, PoW valid)
 * 5. LAZY-ARM: createGrant + armGrant for THAT seat only
 * 6. Losing claimants' bonds return
 *
 * GATED: All live tx submission behind CHRONX_LIVE_SUBMIT (same as settlement)
 */

import type {
  FirstSixProgramState,
  SeatOpening,
  ClaimIntent,
  ClaimResult,
  Clock,
} from "@coldcash/shared";
import {
  getSeatByNumber,
  markSeatClaimed,
  markSeatArmed,
  FIRST_SIX_GRANTOR,
  FIRST_SIX_MONTHLY_CAP_USD,
  FIRST_SIX_WINDOW_COUNT,
  FIRST_SIX_ELIGIBILITY_STANDARD,
} from "@coldcash/shared";
import type { Address, Hex } from "@coldcash/shared";
import type { ChronxWalletClient, GrantCreateIntent, GrantArmIntent, GrantIntent } from "../chronx/wallet-client.js";
import { generateGrantId } from "../chronx/tx-builder.js";

/**
 * Claim validator
 *
 * Checks claim validity:
 * - Seat is open (not claimed, not cancelled)
 * - PoW is valid
 * - Operator node is reachable
 */
export interface ClaimValidator {
  /**
   * Check if operator's ChronX node is reachable and serving RPC
   *
   * @param operatorAddress - Operator's ChronX address
   * @returns true if reachable, false otherwise
   */
  isNodeReachable(operatorAddress: Address): Promise<boolean>;

  /**
   * Validate proof-of-work
   *
   * @param claim - Claim intent
   * @returns true if PoW is valid, false otherwise
   */
  isPoWValid(claim: ClaimIntent): Promise<boolean>;
}

/**
 * Mock claim validator (for testing)
 */
export class MockClaimValidator implements ClaimValidator {
  private reachableNodes = new Set<Address>();

  async isNodeReachable(operatorAddress: Address): Promise<boolean> {
    return this.reachableNodes.has(operatorAddress);
  }

  async isPoWValid(claim: ClaimIntent): Promise<boolean> {
    // Mock: accept any non-empty nonce
    return claim.powNonce.length > 0;
  }

  // Test helper: mark node as reachable
  markNodeReachable(operatorAddress: Address): void {
    this.reachableNodes.add(operatorAddress);
  }
}

/**
 * Claim processor
 *
 * Handles claim submission, DAG ordering, and lazy-arm grant creation.
 */
export class ClaimProcessor {
  constructor(
    private walletClient: ChronxWalletClient,
    private validator: ClaimValidator,
    private clock: Clock
  ) {}

  /**
   * Process a claim intent
   *
   * Steps:
   * 1. Check seat availability
   * 2. Validate claim (PoW, node reachability)
   * 3. Submit claim-tx via wallet-client
   * 4. Resolve FCFS by DAG order (in mock mode, use call order)
   * 5. If winner: lazy-arm grant
   * 6. Return bond if loser or failure
   *
   * @param state - Current program state
   * @param claim - Claim intent
   * @returns Claim result and updated state
   */
  async processClaim(
    state: FirstSixProgramState,
    claim: ClaimIntent
  ): Promise<{ result: ClaimResult; state: FirstSixProgramState }> {
    // 1. Check seat availability
    const seat = getSeatByNumber(state, claim.seatNumber);
    if (!seat) {
      return {
        result: {
          success: false,
          seatNumber: claim.seatNumber,
          operatorAddress: claim.operatorAddress,
          bondReturned: true,
          reason: "Seat not found",
        },
        state,
      };
    }

    if (seat.state !== "open") {
      return {
        result: {
          success: false,
          seatNumber: claim.seatNumber,
          operatorAddress: claim.operatorAddress,
          bondReturned: true,
          reason: `Seat is ${seat.state}, not open`,
        },
        state,
      };
    }

    // 2. Validate claim
    const isPoWValid = await this.validator.isPoWValid(claim);
    if (!isPoWValid) {
      return {
        result: {
          success: false,
          seatNumber: claim.seatNumber,
          operatorAddress: claim.operatorAddress,
          bondReturned: true,
          reason: "Invalid proof-of-work",
        },
        state,
      };
    }

    const isReachable = await this.validator.isNodeReachable(claim.operatorAddress);
    if (!isReachable) {
      return {
        result: {
          success: false,
          seatNumber: claim.seatNumber,
          operatorAddress: claim.operatorAddress,
          bondReturned: true,
          reason: "Node not reachable",
        },
        state,
      };
    }

    // 3. Submit claim-tx
    // PENDING-SIGNING-SPEC: This would shell out to wallet binary
    // For now, we simulate DAG order via claim.claimTxDagOrder
    // In live mode, wallet-client would submit and get back tx_id + DAG order

    // 4. Resolve FCFS (mock: assume claim succeeds if seat still open)
    // In production, this would query DAG commit order from node

    // 5. Mark seat claimed
    const updatedState = markSeatClaimed(
      state,
      claim.seatNumber,
      claim.operatorAddress,
      this.clock
    );

    // 6. Lazy-arm grant
    const grantId = await this.armGrant(claim.seatNumber, claim.operatorAddress);

    // 7. Mark seat armed
    const finalState = markSeatArmed(updatedState, claim.seatNumber, grantId, this.clock);

    return {
      result: {
        success: true,
        seatNumber: claim.seatNumber,
        operatorAddress: claim.operatorAddress,
        grantId,
        bondReturned: false, // Bond consumed on success
        dagOrder: claim.claimTxDagOrder,
      },
      state: finalState,
    };
  }

  /**
   * Lazy-arm grant for a seat
   *
   * Creates and arms a Type_G grant with:
   * - $20/month × 5 windows
   * - Linear payout curve (100% uptime → $20, <80% → $0)
   * - unearned_rollover = false (below-floor reverts to treasury)
   * - Grantor: Upon Proof company wallet dD8X...
   * - Metric spec: anti-fraud standard frozen in
   *
   * @param seatNumber - Seat number
   * @param operatorAddress - Grantee address
   * @returns Grant ID
   */
  private async armGrant(seatNumber: number, operatorAddress: Address): Promise<string> {
    // Generate grant ID
    // PENDING-SIGNING-SPEC: If wallet generates grant_id, this would come from wallet
    const timestamp = Math.floor(this.clock.now() / 1000);
    const grantId = generateGrantId(
      FIRST_SIX_GRANTOR,
      operatorAddress,
      timestamp,
      seatNumber  // Use seat number as nonce differentiator for mock
    );

    // Build GrantCreate intent
    // $20/month × 5 months = $100 per seat
    // Convert to KX: for now, use 1 KX = $0.01 (mock rate)
    // In production, this would query XChan oracle (gated by COLDCASH_TRUST_XCHAN_PRICE)
    const MOCK_KX_TO_USD = 0.01;
    const poolKx = Math.ceil(FIRST_SIX_MONTHLY_CAP_USD * FIRST_SIX_WINDOW_COUNT / MOCK_KX_TO_USD);

    // Window spec: 5 windows, each 30 days (approx 1 month)
    const windowLenSec = 30 * 24 * 60 * 60;
    const expiryTs = timestamp + windowLenSec * FIRST_SIX_WINDOW_COUNT;

    // Payout curve: linear from 80% floor to 100%
    // Steps: [[0.8, 16], [1.0, 20]] means 80% uptime → $16, 100% uptime → $20
    // Below 80% → $0 (threshold enforcement in metric evaluation)
    const createIntent: GrantCreateIntent = {
      grant_id: grantId,
      grantor_legal_identity: "Upon Proof LLC, Delaware",
      grantee_seat: operatorAddress,
      pool_kx: poolKx.toString(),
      expiry_ts: expiryTs,
      metric_spec: {
        class: "B",  // Class B (attested uptime, sensor v1)
        n_of_m: 1,
        witness_seat: "upon-proof-attestor",  // Attestor identity
        spec_plaintext: FIRST_SIX_ELIGIBILITY_STANDARD,
        evidence_hash_required: true,
      },
      payout_curve: {
        type: "stepped",
        steps: [
          [0.8, 16],   // 80% floor → $16 (below this → $0 via threshold)
          [1.0, 20],   // 100% → $20
        ],
      },
      window_spec: {
        window_len: windowLenSec,
        window_cap_kx: Math.ceil(FIRST_SIX_MONTHLY_CAP_USD / MOCK_KX_TO_USD).toString(),
        threshold: 0.8,  // 80% floor
        renews_until: expiryTs,
      },
      unearned_rollover: false,  // Below-floor reverts to treasury
    };

    const armIntent: GrantArmIntent = {
      grant_id: grantId,
    };

    const intents: GrantIntent[] = [
      { type: "GrantCreate", intent: createIntent },
      { type: "GrantArm", intent: armIntent },
    ];

    // Submit via wallet (gated by CHRONX_LIVE_SUBMIT)
    const result = await this.walletClient.submitGrantActions(intents);

    console.log(
      `[First Six] Seat ${seatNumber} armed for ${operatorAddress}: grant ${grantId} (tx: ${result.tx_id}, submitted: ${result.submitted})`
    );

    return grantId;
  }
}

/**
 * Resolve FCFS ties by DAG order
 *
 * When multiple claims arrive for the same seat, DAG commit order determines winner.
 * In mock mode, we simulate DAG order via claimTxDagOrder field.
 *
 * @param claims - Array of claim intents for the same seat
 * @returns Winning claim
 */
export function resolveFCFSByDAGOrder(claims: ClaimIntent[]): ClaimIntent {
  if (claims.length === 0) {
    throw new Error("No claims to resolve");
  }

  if (claims.length === 1) {
    return claims[0];
  }

  // Sort by DAG order (ascending)
  const sorted = [...claims].sort((a, b) => {
    const orderA = a.claimTxDagOrder ?? Infinity;
    const orderB = b.claimTxDagOrder ?? Infinity;
    return orderA - orderB;
  });

  return sorted[0];
}

/**
 * Bond return helper
 *
 * Returns bond to operator if claim fails or loses FCFS race.
 *
 * @param operatorAddress - Operator address
 * @param bondAmount - Bond amount (whole KX)
 */
export async function returnBond(
  walletClient: ChronxWalletClient,
  operatorAddress: Address,
  bondAmount: string
): Promise<void> {
  // PENDING: Bond return mechanism
  // In production, this would submit a bond-return tx
  // For now, log it
  console.log(`[First Six] Bond returned to ${operatorAddress}: ${bondAmount} KX`);
}
