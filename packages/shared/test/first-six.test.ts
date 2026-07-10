/**
 * First Six Program - State Machine Tests
 *
 * Tests:
 * - Drip schedule (6 seats, 30-day cadence)
 * - Valve cancel (scheduled/open only, cannot touch armed)
 * - Seat recycling (exit → new opening on next tick)
 * - State transitions
 */

import { describe, it, expect } from "vitest";
import {
  initializeProgramState,
  updateSeatStates,
  getNextAvailableSeat,
  getSeatByNumber,
  markSeatClaimed,
  markSeatArmed,
  activateValve,
  deactivateValve,
  addRecycledSeat,
  calculateSeatOpeningTime,
  calculateNextTick,
  FixedClock,
  FIRST_SIX_SEAT_COUNT,
  FIRST_SIX_SEAT_INTERVAL_MS,
  type FirstSixProgramState,
  type SeatState,
} from "../src/first-six.js";

describe("First Six - Seat Schedule", () => {
  it("calculates seat opening times correctly", () => {
    const T0 = 1000000;
    const day30 = 30 * 24 * 60 * 60 * 1000;

    expect(calculateSeatOpeningTime(T0, 1)).toBe(T0);
    expect(calculateSeatOpeningTime(T0, 2)).toBe(T0 + day30);
    expect(calculateSeatOpeningTime(T0, 3)).toBe(T0 + day30 * 2);
    expect(calculateSeatOpeningTime(T0, 6)).toBe(T0 + day30 * 5);
  });

  it("initializes 6 seats with correct schedule", () => {
    const T0 = Date.now();
    const clock = new FixedClock(T0);
    const state = initializeProgramState(T0, clock);

    expect(state.openings).toHaveLength(6);
    expect(state.programStartTs).toBe(T0);
    expect(state.valve.isPaused).toBe(false);

    // Seat 1 opens at T0 (should be "open")
    const seat1 = getSeatByNumber(state, 1);
    expect(seat1?.state).toBe("open");
    expect(seat1?.scheduledOpenTs).toBe(T0);

    // Seats 2-6 are scheduled
    for (let i = 2; i <= 6; i++) {
      const seat = getSeatByNumber(state, i);
      expect(seat?.state).toBe("scheduled");
      expect(seat?.scheduledOpenTs).toBe(T0 + (i - 1) * FIRST_SIX_SEAT_INTERVAL_MS);
    }
  });

  it("transitions scheduled seats to open when time arrives", () => {
    const T0 = 1000000;
    const clock = new FixedClock(T0);
    let state = initializeProgramState(T0, clock);

    // Initially, only seat 1 is open
    expect(getSeatByNumber(state, 1)?.state).toBe("open");
    expect(getSeatByNumber(state, 2)?.state).toBe("scheduled");

    // Advance 30 days
    clock.advance(FIRST_SIX_SEAT_INTERVAL_MS);
    state = updateSeatStates(state, clock);

    // Now seat 2 should be open
    expect(getSeatByNumber(state, 2)?.state).toBe("open");
    expect(getSeatByNumber(state, 3)?.state).toBe("scheduled");

    // Advance to day 150 (seat 6)
    clock.set(T0 + FIRST_SIX_SEAT_INTERVAL_MS * 5);
    state = updateSeatStates(state, clock);

    // All 6 seats should be open
    for (let i = 1; i <= 6; i++) {
      expect(getSeatByNumber(state, i)?.state).toBe("open");
    }
  });

  it("getNextAvailableSeat returns first open seat", () => {
    const T0 = 1000000;
    const clock = new FixedClock(T0);
    let state = initializeProgramState(T0, clock);

    // Initially, seat 1 is available
    let next = getNextAvailableSeat(state);
    expect(next?.seatNumber).toBe(1);

    // Claim seat 1
    state = markSeatClaimed(state, 1, "0xABCD" as any, clock);
    next = getNextAvailableSeat(state);
    expect(next).toBe(null); // No more open seats yet

    // Advance 30 days, seat 2 opens
    clock.advance(FIRST_SIX_SEAT_INTERVAL_MS);
    state = updateSeatStates(state, clock);
    next = getNextAvailableSeat(state);
    expect(next?.seatNumber).toBe(2);
  });
});

describe("First Six - State Transitions", () => {
  it("transitions seat: open → claimed → armed", () => {
    const T0 = 1000000;
    const clock = new FixedClock(T0);
    let state = initializeProgramState(T0, clock);

    const operatorAddr = "0xABCD1234" as any;
    const grantId = "grant-123";

    // Mark claimed
    state = markSeatClaimed(state, 1, operatorAddr, clock);
    let seat1 = getSeatByNumber(state, 1);
    expect(seat1?.state).toBe("claimed");
    expect(seat1?.claimedBy).toBe(operatorAddr);
    expect(seat1?.claimedAt).toBe(T0);

    // Mark armed
    state = markSeatArmed(state, 1, grantId, clock);
    seat1 = getSeatByNumber(state, 1);
    expect(seat1?.state).toBe("armed");
    expect(seat1?.grantId).toBe(grantId);
  });

  it("only transitions seats in correct state", () => {
    const T0 = 1000000;
    const clock = new FixedClock(T0);
    let state = initializeProgramState(T0, clock);

    // Cannot mark scheduled seat as claimed
    const seat2 = getSeatByNumber(state, 2);
    expect(seat2?.state).toBe("scheduled");

    state = markSeatClaimed(state, 2, "0xABCD" as any, clock);
    expect(getSeatByNumber(state, 2)?.state).toBe("scheduled"); // Unchanged

    // Cannot mark open seat as armed (must be claimed first)
    state = markSeatArmed(state, 1, "grant-123", clock);
    expect(getSeatByNumber(state, 1)?.state).toBe("open"); // Unchanged
  });
});

describe("First Six - Valve Control", () => {
  it("activates valve and cancels scheduled/open seats", () => {
    const T0 = 1000000;
    const clock = new FixedClock(T0 + FIRST_SIX_SEAT_INTERVAL_MS * 2); // Day 60
    let state = initializeProgramState(T0, clock);
    state = updateSeatStates(state, clock); // Seats 1, 2, 3 open

    // Claim seat 1 and arm it
    state = markSeatClaimed(state, 1, "0xOP1" as any, clock);
    state = markSeatArmed(state, 1, "grant-1", clock);

    // Activate valve
    state = activateValve(state, "joseph@uponproof.com", "fraud investigation", clock);

    expect(state.valve.isPaused).toBe(true);
    expect(state.valve.reason).toBe("fraud investigation");

    // Seat 1 (armed) is UNREACHABLE by valve
    expect(getSeatByNumber(state, 1)?.state).toBe("armed");

    // Seats 2, 3 (open) are cancelled
    expect(getSeatByNumber(state, 2)?.state).toBe("cancelled");
    expect(getSeatByNumber(state, 3)?.state).toBe("cancelled");

    // Seats 4-6 (scheduled) are cancelled
    expect(getSeatByNumber(state, 4)?.state).toBe("cancelled");
    expect(getSeatByNumber(state, 5)?.state).toBe("cancelled");
    expect(getSeatByNumber(state, 6)?.state).toBe("cancelled");
  });

  it("valve cannot affect claimed/armed seats", () => {
    const T0 = 1000000;
    const clock = new FixedClock(T0);
    let state = initializeProgramState(T0, clock);

    // Claim and arm seat 1
    state = markSeatClaimed(state, 1, "0xOP1" as any, clock);
    state = markSeatArmed(state, 1, "grant-1", clock);

    // Activate valve
    state = activateValve(state, "operator", "pause", clock);

    // Seat 1 remains armed (valve has no path to modify it)
    expect(getSeatByNumber(state, 1)?.state).toBe("armed");
  });

  it("deactivates valve and re-schedules cancelled seats", () => {
    const T0 = 1000000;
    const clock = new FixedClock(T0 + FIRST_SIX_SEAT_INTERVAL_MS); // Day 30
    let state = initializeProgramState(T0, clock);
    state = updateSeatStates(state, clock); // Seats 1, 2 open

    // Activate valve (cancels seats 2-6)
    state = activateValve(state, "operator", "pause", clock);
    expect(getSeatByNumber(state, 2)?.state).toBe("cancelled");

    // Deactivate valve
    state = deactivateValve(state, clock);
    expect(state.valve.isPaused).toBe(false);

    // Cancelled seats are re-scheduled on next tick
    const seat2 = getSeatByNumber(state, 2);
    expect(seat2?.state).toBe("scheduled");

    const nextTick = calculateNextTick(T0, clock.now());
    expect(seat2?.scheduledOpenTs).toBe(nextTick);
  });
});

describe("First Six - Seat Recycling", () => {
  it("adds recycled seat on next tick after exit", () => {
    const T0 = 1000000;
    const clock = new FixedClock(T0 + FIRST_SIX_SEAT_INTERVAL_MS * 3); // Day 90
    let state = initializeProgramState(T0, clock);
    state = updateSeatStates(state, clock);

    expect(state.openings).toHaveLength(6); // Initial 6 seats

    // Operator exits seat 2
    state = addRecycledSeat(state, 2, clock);

    expect(state.openings).toHaveLength(7); // Now 7 seats
    const recycled = state.openings.find(s => s.seatNumber === 7);
    expect(recycled?.isRecycled).toBe(true);
    expect(recycled?.recycledFromSeat).toBe(2);
    expect(recycled?.state).toBe("scheduled");

    // Should open on next 30-day tick
    const nextTick = calculateNextTick(T0, clock.now());
    expect(recycled?.scheduledOpenTs).toBe(nextTick);
  });

  it("calculates next tick correctly", () => {
    const T0 = 1000000;
    const day30 = FIRST_SIX_SEAT_INTERVAL_MS;

    // At T0 + 10 days, next tick is T0 + 30 days
    expect(calculateNextTick(T0, T0 + day30 / 3)).toBe(T0 + day30);

    // At T0 + 35 days, next tick is T0 + 60 days
    expect(calculateNextTick(T0, T0 + day30 + 5 * 24 * 60 * 60 * 1000)).toBe(T0 + day30 * 2);

    // At T0 + 180 days (past seat 6), next tick is T0 + 210 days
    expect(calculateNextTick(T0, T0 + day30 * 6)).toBe(T0 + day30 * 7);
  });

  it("handles multiple exits and recycling", () => {
    const T0 = 1000000;
    const clock = new FixedClock(T0 + FIRST_SIX_SEAT_INTERVAL_MS * 10); // Far future
    let state = initializeProgramState(T0, clock);

    // Exit seats 1, 3, 5
    state = addRecycledSeat(state, 1, clock);
    state = addRecycledSeat(state, 3, clock);
    state = addRecycledSeat(state, 5, clock);

    expect(state.openings).toHaveLength(9); // 6 original + 3 recycled

    // Recycled seats are numbered 7, 8, 9
    expect(state.openings.find(s => s.seatNumber === 7)?.recycledFromSeat).toBe(1);
    expect(state.openings.find(s => s.seatNumber === 8)?.recycledFromSeat).toBe(3);
    expect(state.openings.find(s => s.seatNumber === 9)?.recycledFromSeat).toBe(5);
  });
});

describe("First Six - Edge Cases", () => {
  it("handles invalid seat numbers gracefully", () => {
    const T0 = 1000000;
    const clock = new FixedClock(T0);
    const state = initializeProgramState(T0, clock);

    expect(getSeatByNumber(state, 0)).toBe(null);
    expect(getSeatByNumber(state, 99)).toBe(null);
  });

  it("throws error for invalid seat opening calculation", () => {
    const T0 = 1000000;
    expect(() => calculateSeatOpeningTime(T0, 0)).toThrow("Invalid seat number");
    expect(() => calculateSeatOpeningTime(T0, -1)).toThrow("Invalid seat number");
  });

  it("does not transition non-scheduled seats on updateSeatStates", () => {
    const T0 = 1000000;
    const clock = new FixedClock(T0);
    let state = initializeProgramState(T0, clock);

    // Claim seat 1
    state = markSeatClaimed(state, 1, "0xOP" as any, clock);

    // Advance time and update states
    clock.advance(FIRST_SIX_SEAT_INTERVAL_MS * 10);
    state = updateSeatStates(state, clock);

    // Seat 1 remains claimed (not affected by updateSeatStates)
    expect(getSeatByNumber(state, 1)?.state).toBe("claimed");
  });
});
