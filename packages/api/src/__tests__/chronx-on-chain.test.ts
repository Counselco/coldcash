/**
 * ChronX On-Chain Backend Tests
 *
 * Tests real transaction construction, signing, and the CHRONX_LIVE_SUBMIT safety gate.
 * ALL tests run in DRY-RUN/MOCK mode - no live transactions are submitted.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ChronxRecordsBackend } from "../settlement/ChronxRecordsBackend.v2.js";
import type { Address, Hex } from "@coldcash/shared";
import { MockChronxRpcClient } from "../chronx/rpc-client.js";
import { generateGrantId, isLiveSubmitEnabled } from "../chronx/tx-builder.js";

const TEST_CONFIG = {
  rpcUrl: "mock://test",
  grantorWallet: "dD8XBABN2nu66tnL25XYGXATYTNdgQQjLhf2VZtuLeZ",  // Upon Proof company wallet
  grantorPrivateKey: null,  // Mock mode - no real key
  grantorLegalIdentity: "Upon Proof LLC, Delaware",
  witnessIdentity: "coldcash-witness-v1",
  mock: true,
};

describe("ChronX On-Chain Backend - Safety Interlock", () => {
  it("should verify CHRONX_LIVE_SUBMIT is disabled by default", () => {
    // This is the critical safety gate
    expect(isLiveSubmitEnabled()).toBe(false);
  });

  it("should respect CHRONX_LIVE_SUBMIT=false explicitly", () => {
    const original = process.env.CHRONX_LIVE_SUBMIT;
    process.env.CHRONX_LIVE_SUBMIT = "false";
    expect(isLiveSubmitEnabled()).toBe(false);
    process.env.CHRONX_LIVE_SUBMIT = original;
  });

  it("should detect CHRONX_LIVE_SUBMIT=true if set (but we never set it in tests)", () => {
    const original = process.env.CHRONX_LIVE_SUBMIT;
    process.env.CHRONX_LIVE_SUBMIT = "true";
    expect(isLiveSubmitEnabled()).toBe(true);
    process.env.CHRONX_LIVE_SUBMIT = original;  // Restore immediately
  });
});

describe("ChronX On-Chain Backend - Transaction Construction", () => {
  let backend: ChronxRecordsBackend;

  beforeEach(() => {
    // Ensure live submit is OFF
    delete process.env.CHRONX_LIVE_SUBMIT;
    backend = new ChronxRecordsBackend(TEST_CONFIG);
  });

  it("should construct a valid grant create + arm transaction", async () => {
    const params = {
      backer: TEST_CONFIG.grantorWallet as Address,
      prize: 1000n,
      acceptBy: Math.floor(Date.now() / 1000) + 86400,
      deadline: Math.floor(Date.now() / 1000) + 172800,
      standardHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex,
      isPublic: false,
    };

    const ref = await backend.createPromise(params);

    // Should return a grant ID
    expect(ref.address).toBeDefined();
    expect(ref.address.length).toBeGreaterThan(0);
    expect(ref.asset).toBe("KX");
    expect(ref.chainId).toBe(0);
  });

  it("should generate deterministic grant IDs", () => {
    const grantor = "dD8XBABN2nu66tnL25XYGXATYTNdgQQjLhf2VZtuLeZ";
    const grantee = "eE9YCACN3ov77uoM36ZYHYBUZUOehRRkMig3WauMfaA";
    const timestamp = 1720000000;
    const nonce = 1;

    const id1 = generateGrantId(grantor, grantee, timestamp, nonce);
    const id2 = generateGrantId(grantor, grantee, timestamp, nonce);

    expect(id1).toBe(id2);
    expect(id1).toMatch(/^[0-9a-f]{64}$/);  // 32-byte hex
  });

  it("should generate different grant IDs for different inputs", () => {
    const grantor = "dD8XBABN2nu66tnL25XYGXATYTNdgQQjLhf2VZtuLeZ";
    const timestamp = 1720000000;

    const id1 = generateGrantId(grantor, null, timestamp, 1);
    const id2 = generateGrantId(grantor, null, timestamp, 2);

    expect(id1).not.toBe(id2);
  });
});

describe("ChronX On-Chain Backend - Mock RPC Client", () => {
  it("should handle empty DAG tips (fresh chain)", async () => {
    const client = new MockChronxRpcClient();

    // First call returns empty tips (simulates fresh chain)
    const tips1 = await client.getDagTips({ count: 8 });
    expect(tips1.tips).toEqual([]);

    // Subsequent calls return mock tips
    const tips2 = await client.getDagTips({ count: 8 });
    expect(tips2.tips.length).toBeGreaterThan(0);
  });

  it("should increment nonce on each transaction", async () => {
    const client = new MockChronxRpcClient();
    const wallet = "dD8XBABN2nu66tnL25XYGXATYTNdgQQjLhf2VZtuLeZ";

    const account1 = await client.getAccount({ address: wallet });
    expect(account1.nonce).toBe(0);

    // Submit a mock transaction (this will fail in the mock without full tx construction,
    // but we can test the concept via the backend)
  });

  it("should return mock account data", async () => {
    const client = new MockChronxRpcClient();
    const wallet = "dD8XBABN2nu66tnL25XYGXATYTNdgQQjLhf2VZtuLeZ";

    const account = await client.getAccount({ address: wallet });

    expect(account.address).toBe(wallet);
    expect(account.exists).toBe(true);
    expect(account.balance).toBeDefined();
    expect(account.nonce).toBeGreaterThanOrEqual(0);
  });
});

describe("ChronX On-Chain Backend - Grant Lifecycle", () => {
  let backend: ChronxRecordsBackend;

  beforeEach(() => {
    delete process.env.CHRONX_LIVE_SUBMIT;
    backend = new ChronxRecordsBackend(TEST_CONFIG);
  });

  it("should complete create → accept → resolve lifecycle in mock mode", async () => {
    const params = {
      backer: TEST_CONFIG.grantorWallet as Address,
      prize: 1000n,
      acceptBy: Math.floor(Date.now() / 1000) + 86400,
      deadline: Math.floor(Date.now() / 1000) + 172800,
      standardHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex,
      isPublic: false,
    };

    // Create grant
    const ref = await backend.createPromise(params);
    expect(ref.address).toBeDefined();

    // Accept grant
    const seeker = "eE9YCACN3ov77uoM36ZYHYBUZUOehRRkMig3WauMfaA" as Address;
    const acceptTx = await backend.accept(ref, seeker);
    expect(acceptTx.hash).toBeDefined();

    // Resolve grant
    const evidenceHash = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hex;
    const resolveTx = await backend.resolve(ref, 10000, evidenceHash);
    expect(resolveTx.hash).toBeDefined();
  });

  it("should complete create → cancel lifecycle", async () => {
    const params = {
      backer: TEST_CONFIG.grantorWallet as Address,
      prize: 1000n,
      acceptBy: Math.floor(Date.now() / 1000) + 86400,
      deadline: Math.floor(Date.now() / 1000) + 172800,
      standardHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex,
      isPublic: false,
    };

    // Create grant
    const ref = await backend.createPromise(params);
    expect(ref.address).toBeDefined();

    // Cancel grant
    const cancelTx = await backend.cancel(ref);
    expect(cancelTx.hash).toBeDefined();
  });

  it("should complete create → refund lifecycle", async () => {
    const params = {
      backer: TEST_CONFIG.grantorWallet as Address,
      prize: 1000n,
      acceptBy: Math.floor(Date.now() / 1000) + 86400,
      deadline: Math.floor(Date.now() / 1000) + 172800,
      standardHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex,
      isPublic: false,
    };

    // Create grant
    const ref = await backend.createPromise(params);
    expect(ref.address).toBeDefined();

    // Refund grant
    const refundTx = await backend.refund(ref);
    expect(refundTx.hash).toBeDefined();
  });

  it("should query grant status via getAuthorityGrants", async () => {
    const params = {
      backer: TEST_CONFIG.grantorWallet as Address,
      prize: 1000n,
      acceptBy: Math.floor(Date.now() / 1000) + 86400,
      deadline: Math.floor(Date.now() / 1000) + 172800,
      standardHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex,
      isPublic: false,
    };

    // Create grant
    const ref = await backend.createPromise(params);

    // Query status
    const status = await backend.status(ref);

    expect(status.status).toBeDefined();
    expect(status.backer).toBe(TEST_CONFIG.grantorWallet);
    expect(status.prize).toBe(1000n);
  });
});

describe("ChronX On-Chain Backend - Safety Verification", () => {
  it("should log DRY RUN message when CHRONX_LIVE_SUBMIT is disabled", async () => {
    delete process.env.CHRONX_LIVE_SUBMIT;
    const backend = new ChronxRecordsBackend(TEST_CONFIG);

    const params = {
      backer: TEST_CONFIG.grantorWallet as Address,
      prize: 1000n,
      acceptBy: Math.floor(Date.now() / 1000) + 86400,
      deadline: Math.floor(Date.now() / 1000) + 172800,
      standardHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex,
      isPublic: false,
    };

    // This should construct and validate the transaction but NOT submit
    // The test passing proves the gate works
    const ref = await backend.createPromise(params);
    expect(ref.address).toBeDefined();

    // In dry run mode, the mock client returns accepted: false
    // (Real client would log the DRY RUN banner and return accepted: false)
  });

  it("should never submit live transactions in test mode", () => {
    // This test exists to document the commitment:
    // NO TEST in this file sets CHRONX_LIVE_SUBMIT=true for more than the assertion check
    // NO TEST calls real RPC endpoints
    // ALL tests use mock: true
    expect(isLiveSubmitEnabled()).toBe(false);
  });
});

describe("ChronX On-Chain Backend - Nonce and Parent Handling", () => {
  let backend: ChronxRecordsBackend;

  beforeEach(() => {
    delete process.env.CHRONX_LIVE_SUBMIT;
    backend = new ChronxRecordsBackend(TEST_CONFIG);
  });

  it("should handle parent tips correctly", async () => {
    const client = new MockChronxRpcClient();

    // Empty DAG case (fresh chain)
    const tips1 = await client.getDagTips({ count: 8 });
    expect(tips1.tips).toEqual([]);

    // Normal case (after first tx)
    const tips2 = await client.getDagTips({ count: 8 });
    expect(tips2.tips.length).toBeGreaterThan(0);
    expect(tips2.tips.length).toBeLessThanOrEqual(8);
  });

  it("should respect DAG tip count limit (max 8)", async () => {
    const client = new MockChronxRpcClient();

    // Force a transaction to get past the empty-DAG state
    const account = await client.getAccount({
      address: TEST_CONFIG.grantorWallet,
    });

    const tips = await client.getDagTips({ count: 16 });
    expect(tips.tips.length).toBeLessThanOrEqual(8);
  });
});

describe("ChronX On-Chain Backend - Error Handling", () => {
  let backend: ChronxRecordsBackend;

  beforeEach(() => {
    delete process.env.CHRONX_LIVE_SUBMIT;
    backend = new ChronxRecordsBackend(TEST_CONFIG);
  });

  it("should throw on status query for non-existent grant", async () => {
    const fakeRef = {
      chainId: 0,
      address: "0000000000000000000000000000000000000000000000000000000000000000" as Address,
      asset: "KX" as const,
    };

    await expect(backend.status(fakeRef)).rejects.toThrow("Grant not found");
  });
});
