/**
 * First Six Program - Seat State Machine and Types
 *
 * Program law: docs/FIRST-SIX-PROGRAM.md
 *
 * 6 seats, each with lifecycle:
 *   scheduled → open → claimed → armed/active → completed | exited | expired
 *   plus cancelled (valve) for not-yet-claimed openings only
 *
 * Opening cadence: seat 1 opens at program launch T0;
 * each subsequent seat opens 30 days after the prior seat OPENED.
 *
 * Recycling: exited operator's unearned budget re-enters the drip
 * as a new opening on the next 30-day tick.
 *
 * Valve: operator-only action that cancels not-yet-claimed openings
 * and pauses/resumes future openings. Structurally unable to touch claimed/armed grants.
 */

import type { Address, Hex } from "./types.js";

export const FIRST_SIX_SEAT_COUNT = 6;
export const FIRST_SIX_SEAT_INTERVAL_DAYS = 30;
export const FIRST_SIX_SEAT_INTERVAL_MS = FIRST_SIX_SEAT_INTERVAL_DAYS * 24 * 60 * 60 * 1000;

// Program constants (frozen per program law)
export const FIRST_SIX_GRANTOR = "dD8XBABN2nu66tnL25XYGXATYTNdgQQjLhf2VZtuLeZ";
export const FIRST_SIX_MONTHLY_CAP_USD = 20;
export const FIRST_SIX_WINDOW_COUNT = 5;
export const FIRST_SIX_SEAT_CAP_USD = FIRST_SIX_MONTHLY_CAP_USD * FIRST_SIX_WINDOW_COUNT; // $100
export const FIRST_SIX_PROGRAM_CAP_USD = FIRST_SIX_SEAT_CAP_USD * FIRST_SIX_SEAT_COUNT; // $600

// Anti-fraud standard text (frozen into metric spec)
export const FIRST_SIX_ELIGIBILITY_STANDARD =
  "A real, reachable node serving RPC traffic. A mock endpoint, proxy forwarding to someone else's node, or unreachable address does NOT satisfy the standard.";

/**
 * Seat lifecycle states
 *
 * scheduled: seat will open at a future date
 * open: seat is available for claiming
 * claimed: operator has claimed the seat, checks running
 * armed: grant created and armed (ACTIVE on-chain)
 * completed: all 5 months paid out
 * exited: operator voluntarily exited
 * expired: grant expired without full payout
 * cancelled: seat opening cancelled via valve (valve state only, not post-claim)
 */
export type SeatState =
  | "scheduled"
  | "open"
  | "claimed"
  | "armed"
  | "completed"
  | "exited"
  | "expired"
  | "cancelled";

/**
 * Seat opening record
 *
 * Tracks when a seat is scheduled to open or has opened.
 * Does NOT track grant state (that comes from chain reads).
 */
export interface SeatOpening {
  seatNumber: number;          // 1-6 for initial seats, 7+ for recycled
  scheduledOpenTs: number;     // Epoch ms when this seat is scheduled to open
  state: SeatState;
  cancelledAt?: number;        // When valve cancelled this opening (if cancelled)
  claimedBy?: Address;         // Operator address (if claimed)
  claimedAt?: number;          // When claim succeeded (if claimed)
  grantId?: string;            // ChronX grant_id (if armed)
  isRecycled?: boolean;        // True if this seat is recycled from an exit
  recycledFromSeat?: number;   // Original seat number (if recycled)
}

/**
 * Claim transaction intent
 *
 * Operator's claim includes:
 * - operator endpoint (ChronX address)
 * - refundable bond (small KX amount)
 * - proof-of-work (sybil cost)
 */
export interface ClaimIntent {
  seatNumber: number;
  operatorAddress: Address;
  bondAmount: string;          // Whole KX units (e.g., "10")
  powNonce: string;            // PoW solution
  claimTxHash: Hex;            // Claim transaction hash (for DAG ordering)
  claimTxDagOrder?: number;    // DAG commit order (assigned by consensus)
}

/**
 * Claim result
 */
export interface ClaimResult {
  success: boolean;
  seatNumber: number;
  operatorAddress: Address;
  grantId?: string;            // Grant ID if claim succeeded
  bondReturned: boolean;
  reason?: string;             // Reason for failure
  dagOrder?: number;           // DAG commit order
}

/**
 * Valve state
 *
 * Tracks whether enrollment is paused and which openings are cancelled.
 */
export interface ValveState {
  isPaused: boolean;           // If true, no new openings schedule
  pausedAt?: number;           // When valve was activated
  pausedBy?: string;           // Operator who paused (for audit)
  reason?: string;             // Reason for pause
}

/**
 * Program state
 *
 * Single source of truth for program-level state (openings, valve).
 * Grant state comes from chain reads (getAuthorityGrants).
 */
export interface FirstSixProgramState {
  programStartTs: number;      // T0 - when seat 1 opened
  openings: SeatOpening[];     // All seat openings (scheduled, open, claimed, etc.)
  valve: ValveState;           // Enrollment pause/resume state
  lastUpdatedAt: number;       // Last state update timestamp
}

/**
 * Clock interface for deterministic testing
 */
export interface Clock {
  now(): number;  // Returns epoch milliseconds
}

/**
 * System clock (production)
 */
export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}

/**
 * Fixed clock (testing)
 */
export class FixedClock implements Clock {
  constructor(private timestamp: number) {}

  now(): number {
    return this.timestamp;
  }

  set(timestamp: number): void {
    this.timestamp = timestamp;
  }

  advance(ms: number): void {
    this.timestamp += ms;
  }
}

/**
 * Calculate seat opening schedule
 *
 * Seat 1 opens at T0.
 * Each subsequent seat opens 30 days after the prior seat OPENED.
 * Recycled seats extend the cadence but preserve 30-day spacing.
 *
 * @param programStartTs - T0 timestamp (epoch ms)
 * @param seatNumber - Seat number (1-based)
 * @returns Scheduled opening timestamp (epoch ms)
 */
export function calculateSeatOpeningTime(
  programStartTs: number,
  seatNumber: number
): number {
  if (seatNumber < 1) {
    throw new Error(`Invalid seat number: ${seatNumber}`);
  }

  // Seat 1 opens at T0
  if (seatNumber === 1) {
    return programStartTs;
  }

  // Subsequent seats: T0 + (seatNumber - 1) × 30 days
  return programStartTs + (seatNumber - 1) * FIRST_SIX_SEAT_INTERVAL_MS;
}

/**
 * Initialize program state
 *
 * Creates initial schedule for 6 seats starting at T0.
 *
 * @param programStartTs - T0 timestamp (epoch ms)
 * @param clock - Clock for timestamp generation
 * @returns Initial program state
 */
export function initializeProgramState(
  programStartTs: number,
  clock: Clock = new SystemClock()
): FirstSixProgramState {
  const now = clock.now();

  // Create initial 6 seat openings
  const openings: SeatOpening[] = [];
  for (let i = 1; i <= FIRST_SIX_SEAT_COUNT; i++) {
    const scheduledOpenTs = calculateSeatOpeningTime(programStartTs, i);
    const state: SeatState = scheduledOpenTs <= now ? "open" : "scheduled";

    openings.push({
      seatNumber: i,
      scheduledOpenTs,
      state,
    });
  }

  return {
    programStartTs,
    openings,
    valve: {
      isPaused: false,
    },
    lastUpdatedAt: now,
  };
}

/**
 * Update seat state based on clock
 *
 * Transitions scheduled seats to open when their time arrives.
 * Does NOT modify claimed/armed/completed/exited seats.
 *
 * @param state - Current program state
 * @param clock - Clock for time checks
 * @returns Updated program state
 */
export function updateSeatStates(
  state: FirstSixProgramState,
  clock: Clock = new SystemClock()
): FirstSixProgramState {
  const now = clock.now();

  const openings = state.openings.map(opening => {
    // Only transition scheduled → open
    if (opening.state === "scheduled" && opening.scheduledOpenTs <= now) {
      return { ...opening, state: "open" as SeatState };
    }
    return opening;
  });

  return {
    ...state,
    openings,
    lastUpdatedAt: now,
  };
}

/**
 * Get next available seat for claiming
 *
 * Returns the first seat in "open" state, or null if none available.
 *
 * @param state - Current program state
 * @returns Next available seat opening, or null
 */
export function getNextAvailableSeat(
  state: FirstSixProgramState
): SeatOpening | null {
  return state.openings.find(s => s.state === "open") || null;
}

/**
 * Get seat by number
 *
 * @param state - Current program state
 * @param seatNumber - Seat number (1-based)
 * @returns Seat opening, or null if not found
 */
export function getSeatByNumber(
  state: FirstSixProgramState,
  seatNumber: number
): SeatOpening | null {
  return state.openings.find(s => s.seatNumber === seatNumber) || null;
}

/**
 * Mark seat as claimed
 *
 * Transitions seat: open → claimed
 *
 * @param state - Current program state
 * @param seatNumber - Seat number
 * @param operatorAddress - Claiming operator
 * @param clock - Clock for timestamp
 * @returns Updated program state
 */
export function markSeatClaimed(
  state: FirstSixProgramState,
  seatNumber: number,
  operatorAddress: Address,
  clock: Clock = new SystemClock()
): FirstSixProgramState {
  const now = clock.now();

  const openings = state.openings.map(opening => {
    if (opening.seatNumber === seatNumber && opening.state === "open") {
      return {
        ...opening,
        state: "claimed" as SeatState,
        claimedBy: operatorAddress,
        claimedAt: now,
      };
    }
    return opening;
  });

  return {
    ...state,
    openings,
    lastUpdatedAt: now,
  };
}

/**
 * Mark seat as armed
 *
 * Transitions seat: claimed → armed
 * Records grant_id for chain state association.
 *
 * @param state - Current program state
 * @param seatNumber - Seat number
 * @param grantId - ChronX grant ID
 * @param clock - Clock for timestamp
 * @returns Updated program state
 */
export function markSeatArmed(
  state: FirstSixProgramState,
  seatNumber: number,
  grantId: string,
  clock: Clock = new SystemClock()
): FirstSixProgramState {
  const now = clock.now();

  const openings = state.openings.map(opening => {
    if (opening.seatNumber === seatNumber && opening.state === "claimed") {
      return {
        ...opening,
        state: "armed" as SeatState,
        grantId,
      };
    }
    return opening;
  });

  return {
    ...state,
    openings,
    lastUpdatedAt: now,
  };
}

/**
 * Activate valve (cancel not-yet-claimed openings, pause future openings)
 *
 * SAFETY: Valve can ONLY affect seats in "scheduled" or "open" state.
 * Claimed/armed grants are STRUCTURALLY unreachable.
 *
 * @param state - Current program state
 * @param operatorId - Who activated valve (audit trail)
 * @param reason - Reason for activation
 * @param clock - Clock for timestamp
 * @returns Updated program state
 */
export function activateValve(
  state: FirstSixProgramState,
  operatorId: string,
  reason: string,
  clock: Clock = new SystemClock()
): FirstSixProgramState {
  const now = clock.now();

  // Cancel all scheduled and open seats
  const openings = state.openings.map(opening => {
    if (opening.state === "scheduled" || opening.state === "open") {
      return {
        ...opening,
        state: "cancelled" as SeatState,
        cancelledAt: now,
      };
    }
    // claimed/armed/completed/exited/expired are UNREACHABLE by valve
    return opening;
  });

  return {
    ...state,
    openings,
    valve: {
      isPaused: true,
      pausedAt: now,
      pausedBy: operatorId,
      reason,
    },
    lastUpdatedAt: now,
  };
}

/**
 * Deactivate valve (resume enrollment)
 *
 * Re-schedules cancelled seats on the next 30-day tick.
 *
 * @param state - Current program state
 * @param clock - Clock for timestamp
 * @returns Updated program state
 */
export function deactivateValve(
  state: FirstSixProgramState,
  clock: Clock = new SystemClock()
): FirstSixProgramState {
  const now = clock.now();

  // Find all cancelled seats and re-schedule them
  const openings = state.openings.map(opening => {
    if (opening.state === "cancelled") {
      // Find next 30-day tick after now
      const nextTick = calculateNextTick(state.programStartTs, now);

      return {
        ...opening,
        state: "scheduled" as SeatState,
        scheduledOpenTs: nextTick,
        cancelledAt: undefined,
      };
    }
    return opening;
  });

  return {
    ...state,
    openings,
    valve: {
      isPaused: false,
    },
    lastUpdatedAt: now,
  };
}

/**
 * Calculate next 30-day tick after given timestamp
 *
 * @param programStartTs - T0
 * @param now - Current timestamp
 * @returns Next tick timestamp
 */
export function calculateNextTick(programStartTs: number, now: number): number {
  const elapsed = now - programStartTs;
  const ticksPassed = Math.floor(elapsed / FIRST_SIX_SEAT_INTERVAL_MS);
  return programStartTs + (ticksPassed + 1) * FIRST_SIX_SEAT_INTERVAL_MS;
}

/**
 * Add recycled seat
 *
 * When an operator exits, their unearned budget re-enters as a new opening
 * on the next 30-day tick.
 *
 * @param state - Current program state
 * @param originalSeatNumber - Seat number that was exited
 * @param clock - Clock for timestamp
 * @returns Updated program state
 */
export function addRecycledSeat(
  state: FirstSixProgramState,
  originalSeatNumber: number,
  clock: Clock = new SystemClock()
): FirstSixProgramState {
  const now = clock.now();

  // Next seat number is max existing + 1
  const nextSeatNumber = Math.max(...state.openings.map(s => s.seatNumber)) + 1;

  // Schedule on next tick
  const scheduledOpenTs = calculateNextTick(state.programStartTs, now);

  const recycledSeat: SeatOpening = {
    seatNumber: nextSeatNumber,
    scheduledOpenTs,
    state: "scheduled",
    isRecycled: true,
    recycledFromSeat: originalSeatNumber,
  };

  return {
    ...state,
    openings: [...state.openings, recycledSeat],
    lastUpdatedAt: now,
  };
}
