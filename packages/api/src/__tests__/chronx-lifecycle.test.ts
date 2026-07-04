import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ChronxRecordsBackend } from "../settlement/ChronxRecordsBackend.js";
import type { Address, Hex } from "@coldcash/shared";
import { mkdirSync, rmSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { keccak256, encodePacked } from "viem";

const TEST_RECORDS_DIR = join(process.cwd(), "test-records-lifecycle");
const TEST_SEQUENCE_PATH = join(TEST_RECORDS_DIR, "sequence.txt");

describe("ChronX Records Lifecycle Test", () => {
  let backend: ChronxRecordsBackend;

  beforeEach(() => {
    mkdirSync(TEST_RECORDS_DIR, { recursive: true });
    backend = new ChronxRecordsBackend({
      recordsDir: TEST_RECORDS_DIR,
      grantIdSequencePath: TEST_SEQUENCE_PATH,
      defaultGrantor: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
      witnessIdentity: "coldcash-witness-v1"
    });
  });

  afterEach(() => {
    rmSync(TEST_RECORDS_DIR, { recursive: true, force: true });
  });

  it("should complete full lifecycle: create -> accept -> resolve with graded curve", async () => {
    // Create promise
    const params = {
      backer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
      prize: 1000n,
      acceptBy: 1720000000,
      deadline: 1720086400,
      standardHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex,
      isPublic: false
    };

    const ref = await backend.createPromise(params);
    expect(ref.address).toBe("coldcash-g0001");

    // Verify armed record exists
    const armedPath = join(TEST_RECORDS_DIR, "grants", "coldcash-g0001-armed.json");
    expect(existsSync(armedPath)).toBe(true);

    // Accept
    const seeker = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;
    const acceptTx = await backend.accept(ref, seeker);

    // After accept, the payload is updated with grantee_seat, so hash changes
    const updatedPayload = JSON.parse(readFileSync(armedPath, "utf-8"));
    const payloadHash = keccak256(encodePacked(["string"], [JSON.stringify(updatedPayload, Object.keys(updatedPayload).sort())]));
    expect(acceptTx.hash).toBe(payloadHash);

    // Verify acceptance record
    const acceptPath = join(TEST_RECORDS_DIR, "grants", "coldcash-g0001-accept.json");
    expect(existsSync(acceptPath)).toBe(true);

    const acceptRecord = JSON.parse(readFileSync(acceptPath, "utf-8"));
    expect(acceptRecord.grant_id).toBe("coldcash-g0001");
    expect(acceptRecord.grantee_seat).toBe(seeker);
    expect(acceptRecord.payload_hash).toBe(payloadHash);

    // Check status after accept
    let status = await backend.status(ref);
    expect(status.status).toBe("Accepted");
    expect(status.seeker).toBe(seeker);

    // Resolve with full payout (10000 bps = 100%)
    const evidenceHash = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hex;
    const resolveTx = await backend.resolve(ref, 10000, evidenceHash);
    expect(resolveTx.hash).toBe(payloadHash);

    // Verify resolution record
    const resolvePath = join(TEST_RECORDS_DIR, "grants", "coldcash-g0001-resolve.json");
    expect(existsSync(resolvePath)).toBe(true);

    const resolveRecord = JSON.parse(readFileSync(resolvePath, "utf-8"));
    expect(resolveRecord.grant_id).toBe("coldcash-g0001");
    expect(resolveRecord.window).toBe(1);
    expect(resolveRecord.metric_value).toBe(1);
    expect(resolveRecord.evidence_hash).toBe(evidenceHash);
    expect(resolveRecord.payout_kx).toBe("1000");
    expect(resolveRecord.settlement_ref).toBeNull();

    // Check final status
    status = await backend.status(ref);
    expect(status.status).toBe("Paid");
    expect(status.paidBps).toBe(10000);
  });

  it("should handle partial payout with graded curve", async () => {
    const params = {
      backer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
      prize: 1000n,
      acceptBy: 1720000000,
      deadline: 1720086400,
      standardHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex,
      isPublic: false
    };

    const ref = await backend.createPromise(params);
    const seeker = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;
    await backend.accept(ref, seeker);

    // Resolve with partial payout (5000 bps = 50%)
    const evidenceHash = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hex;
    await backend.resolve(ref, 5000, evidenceHash);

    const resolvePath = join(TEST_RECORDS_DIR, "grants", "coldcash-g0001-resolve.json");
    const resolveRecord = JSON.parse(readFileSync(resolvePath, "utf-8"));

    expect(resolveRecord.metric_value).toBe(0.5);
    expect(resolveRecord.payout_kx).toBe("0");

    const status = await backend.status(ref);
    expect(status.status).toBe("Paid");
    expect(status.paidBps).toBe(5000);
  });

  it("should handle null metric (fail-closed)", async () => {
    const params = {
      backer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
      prize: 1000n,
      acceptBy: 1720000000,
      deadline: 1720086400,
      standardHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex,
      isPublic: false
    };

    const ref = await backend.createPromise(params);
    const seeker = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;
    await backend.accept(ref, seeker);

    // Resolve with zero bps (null metric)
    const evidenceHash = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hex;
    await backend.resolve(ref, 0, evidenceHash);

    const resolvePath = join(TEST_RECORDS_DIR, "grants", "coldcash-g0001-resolve.json");
    const resolveRecord = JSON.parse(readFileSync(resolvePath, "utf-8"));

    expect(resolveRecord.metric_value).toBeNull();
    expect(resolveRecord.payout_kx).toBe("0");

    const status = await backend.status(ref);
    expect(status.status).toBe("Paid");
    expect(status.paidBps).toBe(0);
  });

  it("should handle expiry revert lifecycle: create -> expiry -> refund", async () => {
    const params = {
      backer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
      prize: 1000n,
      acceptBy: 1720000000,
      deadline: 1720086400,
      standardHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex,
      isPublic: false
    };

    const ref = await backend.createPromise(params);

    // Refund (expiry revert)
    const refundTx = await backend.refund(ref);

    // Verify revert record
    const revertPath = join(TEST_RECORDS_DIR, "grants", "coldcash-g0001-revert.json");
    expect(existsSync(revertPath)).toBe(true);

    const revertRecord = JSON.parse(readFileSync(revertPath, "utf-8"));
    expect(revertRecord.grant_id).toBe("coldcash-g0001");
    expect(revertRecord.reason).toBe("expiry");

    // Check status
    const status = await backend.status(ref);
    expect(status.status).toBe("Refunded");
  });

  it("should handle cancel (lapse) lifecycle", async () => {
    const params = {
      backer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
      prize: 1000n,
      acceptBy: 1720000000,
      deadline: 1720086400,
      standardHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex,
      isPublic: false
    };

    const ref = await backend.createPromise(params);

    // Cancel
    await backend.cancel(ref);

    // Verify revert record with lapse reason
    const revertPath = join(TEST_RECORDS_DIR, "grants", "coldcash-g0001-revert.json");
    expect(existsSync(revertPath)).toBe(true);

    const revertRecord = JSON.parse(readFileSync(revertPath, "utf-8"));
    expect(revertRecord.grant_id).toBe("coldcash-g0001");
    expect(revertRecord.reason).toBe("lapse");

    // Check status
    const status = await backend.status(ref);
    expect(status.status).toBe("Canceled");
  });

  it("should verify all record hashes match canonical payload", async () => {
    const params = {
      backer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
      prize: 1000n,
      acceptBy: 1720000000,
      deadline: 1720086400,
      standardHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex,
      isPublic: false
    };

    const ref = await backend.createPromise(params);
    const seeker = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;
    await backend.accept(ref, seeker);

    const evidenceHash = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hex;
    await backend.resolve(ref, 10000, evidenceHash);

    // Read all records
    const armedPath = join(TEST_RECORDS_DIR, "grants", "coldcash-g0001-armed.json");
    const acceptPath = join(TEST_RECORDS_DIR, "grants", "coldcash-g0001-accept.json");
    const resolvePath = join(TEST_RECORDS_DIR, "grants", "coldcash-g0001-resolve.json");

    // After accept, the armed payload is updated with grantee_seat
    const updatedPayload = JSON.parse(readFileSync(armedPath, "utf-8"));
    const acceptRecord = JSON.parse(readFileSync(acceptPath, "utf-8"));
    const resolveRecord = JSON.parse(readFileSync(resolvePath, "utf-8"));

    // Compute canonical hash from updated payload
    const canonical = JSON.stringify(updatedPayload, Object.keys(updatedPayload).sort());
    const expectedHash = keccak256(encodePacked(["string"], [canonical]));

    // Verify all hashes match the updated payload
    expect(acceptRecord.payload_hash).toBe(expectedHash);
    expect(resolveRecord.payload_hash).toBe(expectedHash);
  });
});
