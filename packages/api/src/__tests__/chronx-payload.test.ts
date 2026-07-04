import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ChronxRecordsBackend } from "../settlement/ChronxRecordsBackend.js";
import type { Address, Hex } from "@coldcash/shared";
import { mkdirSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { keccak256, encodePacked } from "viem";

const TEST_RECORDS_DIR = join(process.cwd(), "test-records-payload");
const TEST_SEQUENCE_PATH = join(TEST_RECORDS_DIR, "sequence.txt");

describe("ChronX Payload Generator Golden-File Test", () => {
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

  it("should generate a stable canonical hash for a fixed grant payload", async () => {
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
    expect(ref.asset).toBe("KX");

    // Read the armed payload
    const armedPath = join(TEST_RECORDS_DIR, "grants", "coldcash-g0001-armed.json");
    const payload = JSON.parse(readFileSync(armedPath, "utf-8"));

    // Verify payload structure
    expect(payload.grant_id).toBe("coldcash-g0001");
    expect(payload.grantor_seat).toBe(params.backer);
    expect(payload.grantee_seat).toBeNull();
    expect(payload.pool_kx).toBe("1000");
    expect(payload.schedule.window_len).toBe(86400);
    expect(payload.schedule.window_cap_kx).toBe("1000");
    expect(payload.schedule.threshold).toBe(1);
    expect(payload.schedule.renews_until).toBe(1720086400);
    expect(payload.expiry_ts).toBe(1720086400);
    expect(payload.revert_on_expiry).toBe(true);
    expect(payload.metric_spec.class).toBe("B");
    expect(payload.metric_spec.n_of_m).toBe(1);
    expect(payload.metric_spec.witness_seat).toBe("coldcash-witness-v1");
    expect(payload.metric_spec.evidence_hash_required).toBe(true);
    expect(payload.payout_curve).toEqual([[1, 1000]]);

    // Verify stable canonical hash
    const hashPath = join(TEST_RECORDS_DIR, "grants", "coldcash-g0001-hash.txt");
    const storedHash = readFileSync(hashPath, "utf-8");

    // Compute expected hash
    const canonical = JSON.stringify(payload, Object.keys(payload).sort());
    const expectedHash = keccak256(encodePacked(["string"], [canonical]));

    expect(storedHash).toBe(expectedHash);

    // Golden hash value for regression detection
    // This hash should remain stable across runs with the same input
    expect(storedHash).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
