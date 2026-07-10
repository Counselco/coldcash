/**
 * First Six - Claim Flow Tests
 *
 * Tests:
 * - FCFS tie resolution by DAG order
 * - Lazy-arm fires only after checks pass
 * - Bond return paths
 * - CHRONX_LIVE_SUBMIT gate suppression
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  ClaimProcessor,
  MockClaimValidator,
  resolveFCFSByDAGOrder,
  type ClaimIntent,
} from "../claim-flow.js";
import {
  initializeProgramState,
  FixedClock,
  type FirstSixProgramState,
} from "@coldcash/shared";
import type { Address } from "@coldcash/shared";
import { ChronxWalletClient } from "../../chronx/wallet-client.js";

// Mock wallet client for testing
class MockWalletClient extends ChronxWalletClient {
  private mockTxId = "0x0000000000000000000000000000000000000000000000000000000000000001";
  private submitCount = 0;

  constructor() {
    super({
      walletBinPath: "mock-wallet",
      keyfilePath: "mock-keyfile",
    });
  }

  async submitGrantActions(): Promise<{ tx_id: string; submitted: boolean }> {
    this.submitCount++;
    return {
      tx_id: this.mockTxId,
      submitted: false, // Always dry-run in tests
    };
  }

  getSubmitCount(): number {
    return this.submitCount;
  }
}

describe("First Six - FCFS by DAG Order", () => {
  it("resolves single claim trivially", () => {
    const claim: ClaimIntent = {
      seatNumber: 1,
      operatorAddress: "0xOP1" as Address,
      bondAmount: "10",
      powNonce: "abc123",
      claimTxHash: "0x001" as any,
      claimTxDagOrder: 1,
    };

    const winner = resolveFCFSByDAGOrder([claim]);
    expect(winner).toBe(claim);
  });

  it("resolves tie by lowest DAG order", () => {
    const claim1: ClaimIntent = {
      seatNumber: 1,
      operatorAddress: "0xOP1" as Address,
      bondAmount: "10",
      powNonce: "abc",
      claimTxHash: "0x001" as any,
      claimTxDagOrder: 5,
    };

    const claim2: ClaimIntent = {
      seatNumber: 1,
      operatorAddress: "0xOP2" as Address,
      bondAmount: "10",
      powNonce: "def",
      claimTxHash: "0x002" as any,
      claimTxDagOrder: 2, // Lower DAG order → wins
    };

    const claim3: ClaimIntent = {
      seatNumber: 1,
      operatorAddress: "0xOP3" as Address,
      bondAmount: "10",
      powNonce: "ghi",
      claimTxHash: "0x003" as any,
      claimTxDagOrder: 10,
    };

    const winner = resolveFCFSByDAGOrder([claim1, claim2, claim3]);
    expect(winner).toBe(claim2);
    expect(winner.operatorAddress).toBe("0xOP2");
  });

  it("handles missing DAG order gracefully", () => {
    const claim1: ClaimIntent = {
      seatNumber: 1,
      operatorAddress: "0xOP1" as Address,
      bondAmount: "10",
      powNonce: "abc",
      claimTxHash: "0x001" as any,
      // No claimTxDagOrder (treated as Infinity)
    };

    const claim2: ClaimIntent = {
      seatNumber: 1,
      operatorAddress: "0xOP2" as Address,
      bondAmount: "10",
      powNonce: "def",
      claimTxHash: "0x002" as any,
      claimTxDagOrder: 100,
    };

    const winner = resolveFCFSByDAGOrder([claim1, claim2]);
    expect(winner).toBe(claim2); // claim2 has explicit order
  });

  it("throws error for empty claim list", () => {
    expect(() => resolveFCFSByDAGOrder([])).toThrow("No claims to resolve");
  });
});

describe("First Six - Claim Processing", () => {
  let processor: ClaimProcessor;
  let validator: MockClaimValidator;
  let wallet: MockWalletClient;
  let clock: FixedClock;
  let state: FirstSixProgramState;

  beforeEach(() => {
    const T0 = 1000000;
    clock = new FixedClock(T0);
    state = initializeProgramState(T0, clock);

    validator = new MockClaimValidator();
    wallet = new MockWalletClient();
    processor = new ClaimProcessor(wallet as any, validator, clock);
  });

  it("rejects claim for non-existent seat", async () => {
    const claim: ClaimIntent = {
      seatNumber: 99,
      operatorAddress: "0xOP1" as Address,
      bondAmount: "10",
      powNonce: "abc123",
      claimTxHash: "0x001" as any,
    };

    const { result, state: newState } = await processor.processClaim(state, claim);

    expect(result.success).toBe(false);
    expect(result.reason).toBe("Seat not found");
    expect(result.bondReturned).toBe(true);
    expect(newState).toBe(state); // State unchanged
  });

  it("rejects claim for non-open seat", async () => {
    // Seat 2 is scheduled, not open
    const claim: ClaimIntent = {
      seatNumber: 2,
      operatorAddress: "0xOP1" as Address,
      bondAmount: "10",
      powNonce: "abc123",
      claimTxHash: "0x001" as any,
    };

    const { result, state: newState } = await processor.processClaim(state, claim);

    expect(result.success).toBe(false);
    expect(result.reason).toContain("not open");
    expect(result.bondReturned).toBe(true);
  });

  it("rejects claim with invalid PoW", async () => {
    const claim: ClaimIntent = {
      seatNumber: 1,
      operatorAddress: "0xOP1" as Address,
      bondAmount: "10",
      powNonce: "", // Invalid (empty)
      claimTxHash: "0x001" as any,
    };

    const { result } = await processor.processClaim(state, claim);

    expect(result.success).toBe(false);
    expect(result.reason).toBe("Invalid proof-of-work");
    expect(result.bondReturned).toBe(true);
  });

  it("rejects claim for unreachable node", async () => {
    const claim: ClaimIntent = {
      seatNumber: 1,
      operatorAddress: "0xOP1" as Address,
      bondAmount: "10",
      powNonce: "abc123",
      claimTxHash: "0x001" as any,
    };

    // Do NOT mark node as reachable
    const { result } = await processor.processClaim(state, claim);

    expect(result.success).toBe(false);
    expect(result.reason).toBe("Node not reachable");
    expect(result.bondReturned).toBe(true);
  });

  it("accepts valid claim and arms grant", async () => {
    const claim: ClaimIntent = {
      seatNumber: 1,
      operatorAddress: "0xOP1" as Address,
      bondAmount: "10",
      powNonce: "abc123",
      claimTxHash: "0x001" as any,
      claimTxDagOrder: 1,
    };

    // Mark node as reachable
    validator.markNodeReachable("0xOP1" as Address);

    const { result, state: newState } = await processor.processClaim(state, claim);

    expect(result.success).toBe(true);
    expect(result.grantId).toBeDefined();
    expect(result.bondReturned).toBe(false); // Bond consumed on success

    // Seat 1 is now armed
    const seat1 = newState.openings.find(s => s.seatNumber === 1);
    expect(seat1?.state).toBe("armed");
    expect(seat1?.claimedBy).toBe("0xOP1");
    expect(seat1?.grantId).toBe(result.grantId);
  });

  it("lazy-arm fires only once per successful claim", async () => {
    const claim: ClaimIntent = {
      seatNumber: 1,
      operatorAddress: "0xOP1" as Address,
      bondAmount: "10",
      powNonce: "abc123",
      claimTxHash: "0x001" as any,
    };

    validator.markNodeReachable("0xOP1" as Address);

    await processor.processClaim(state, claim);

    // Wallet submitGrantActions should be called exactly once
    expect(wallet.getSubmitCount()).toBe(1);
  });

  it("lazy-arm does NOT fire if checks fail", async () => {
    const claim: ClaimIntent = {
      seatNumber: 1,
      operatorAddress: "0xOP1" as Address,
      bondAmount: "10",
      powNonce: "", // Invalid PoW
      claimTxHash: "0x001" as any,
    };

    validator.markNodeReachable("0xOP1" as Address);

    await processor.processClaim(state, claim);

    // Wallet submitGrantActions should NOT be called
    expect(wallet.getSubmitCount()).toBe(0);
  });
});

describe("First Six - CHRONX_LIVE_SUBMIT Gate", () => {
  it("wallet submit returns submitted=false in dry-run mode", async () => {
    const wallet = new MockWalletClient();
    const result = await wallet.submitGrantActions([]);

    // Mock wallet always returns submitted=false (simulating CHRONX_LIVE_SUBMIT=false)
    expect(result.submitted).toBe(false);
    expect(result.tx_id).toBeDefined();
  });

  it("claim processing works in dry-run mode", async () => {
    const T0 = 1000000;
    const clock = new FixedClock(T0);
    const state = initializeProgramState(T0, clock);

    const validator = new MockClaimValidator();
    const wallet = new MockWalletClient();
    const processor = new ClaimProcessor(wallet as any, validator, clock);

    const claim: ClaimIntent = {
      seatNumber: 1,
      operatorAddress: "0xOP1" as Address,
      bondAmount: "10",
      powNonce: "abc123",
      claimTxHash: "0x001" as any,
    };

    validator.markNodeReachable("0xOP1" as Address);

    const { result } = await processor.processClaim(state, claim);

    // Claim succeeds even in dry-run mode
    expect(result.success).toBe(true);
    expect(result.grantId).toBeDefined();

    // But wallet indicates not submitted
    const walletResult = await wallet.submitGrantActions([]);
    expect(walletResult.submitted).toBe(false);
  });
});

describe("First Six - Bond Return Paths", () => {
  let processor: ClaimProcessor;
  let validator: MockClaimValidator;
  let wallet: MockWalletClient;
  let clock: FixedClock;
  let state: FirstSixProgramState;

  beforeEach(() => {
    const T0 = 1000000;
    clock = new FixedClock(T0);
    state = initializeProgramState(T0, clock);

    validator = new MockClaimValidator();
    wallet = new MockWalletClient();
    processor = new ClaimProcessor(wallet as any, validator, clock);
  });

  it("returns bond on invalid seat", async () => {
    const claim: ClaimIntent = {
      seatNumber: 99,
      operatorAddress: "0xOP1" as Address,
      bondAmount: "10",
      powNonce: "abc123",
      claimTxHash: "0x001" as any,
    };

    const { result } = await processor.processClaim(state, claim);
    expect(result.bondReturned).toBe(true);
  });

  it("returns bond on seat not open", async () => {
    const claim: ClaimIntent = {
      seatNumber: 2, // Scheduled, not open
      operatorAddress: "0xOP1" as Address,
      bondAmount: "10",
      powNonce: "abc123",
      claimTxHash: "0x001" as any,
    };

    const { result } = await processor.processClaim(state, claim);
    expect(result.bondReturned).toBe(true);
  });

  it("returns bond on invalid PoW", async () => {
    const claim: ClaimIntent = {
      seatNumber: 1,
      operatorAddress: "0xOP1" as Address,
      bondAmount: "10",
      powNonce: "",
      claimTxHash: "0x001" as any,
    };

    const { result } = await processor.processClaim(state, claim);
    expect(result.bondReturned).toBe(true);
  });

  it("returns bond on unreachable node", async () => {
    const claim: ClaimIntent = {
      seatNumber: 1,
      operatorAddress: "0xOP1" as Address,
      bondAmount: "10",
      powNonce: "abc123",
      claimTxHash: "0x001" as any,
    };

    const { result } = await processor.processClaim(state, claim);
    expect(result.bondReturned).toBe(true);
  });

  it("does NOT return bond on successful claim", async () => {
    const claim: ClaimIntent = {
      seatNumber: 1,
      operatorAddress: "0xOP1" as Address,
      bondAmount: "10",
      powNonce: "abc123",
      claimTxHash: "0x001" as any,
    };

    validator.markNodeReachable("0xOP1" as Address);

    const { result } = await processor.processClaim(state, claim);
    expect(result.bondReturned).toBe(false); // Bond consumed
  });
});
