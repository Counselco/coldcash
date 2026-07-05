import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ChronxRecordsBackend } from "../settlement/ChronxRecordsBackend.js";
import { intake } from "../routes/promises.js";
import { standardHash, type Address, type Hex } from "@coldcash/shared";
import { generateAttestationRecord, type GitHubPullRequest } from "@coldcash/oracle/dist/chronx-attestor.js";
import { mkdirSync, rmSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { keccak256, encodePacked } from "viem";

const TEST_RECORDS_DIR = join(process.cwd(), "test-records-kx-e2e");
const TEST_SEQUENCE_PATH = join(TEST_RECORDS_DIR, "sequence.txt");

/**
 * GATE 0 (KX LANE): Full-thread E2E test
 *
 * This test mirrors the USDC Gate 0 test (full-e2e.integration.test.ts) but for the KX lane.
 * It proves the entire KX stack composes correctly in a single unbroken thread:
 *
 * 1. Intake wizard produces frozen standard
 * 2. ChronxRecordsBackend creates armed payload record
 * 3. Accept record created with grantee seat
 * 4. attest-chronx fixture attestation consumed
 * 5. Resolution record with graded payout_kx computed from curve
 * 6. All record hashes verified against canonical payload
 */
describe("KX Full-Thread E2E: Intake → Records → Accept → Attest → Resolve", () => {
  let backend: ChronxRecordsBackend;
  const backer = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address;
  const seeker = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;

  beforeEach(() => {
    mkdirSync(TEST_RECORDS_DIR, { recursive: true });
    backend = new ChronxRecordsBackend({
      recordsDir: TEST_RECORDS_DIR,
      grantIdSequencePath: TEST_SEQUENCE_PATH,
      defaultGrantor: backer,
      witnessIdentity: "coldcash-witness-v1"
    });
  });

  afterEach(() => {
    rmSync(TEST_RECORDS_DIR, { recursive: true, force: true });
  });

  it("full thread: intake → frozen standard → createPromise → accept → attest → resolve → verify hashes", async () => {
    // === STEP 1: INTAKE ===
    // Produce frozen standard from intake wizard
    const deadline = Math.floor(Date.now() / 1000) + 604800;
    const intakeResult = await intake({
      wish: `merge PR #42 in testorg/testrepo by ${deadline}`,
      backerAddress: backer,
      isPublic: false,
    });

    expect(intakeResult.kind).toBe("github-merge");
    expect(intakeResult.frozen.standardHash).toMatch(/^0x[0-9a-f]{64}$/);

    // === STEP 2: CREATE PROMISE (Armed Payload) ===
    const promiseRef = await backend.createPromise({
      backer,
      prize: 50000n,  // 50,000 KX
      acceptBy: Math.floor(Date.now() / 1000) + 86400,
      deadline,
      standardHash: intakeResult.frozen.standardHash as Hex,
      isPublic: false
    });

    expect(promiseRef.address).toBe("coldcash-g0001");

    // Verify armed record exists
    const armedPath = join(TEST_RECORDS_DIR, "grants", "coldcash-g0001-armed.json");
    expect(existsSync(armedPath)).toBe(true);

    const armedPayload = JSON.parse(readFileSync(armedPath, "utf-8"));
    expect(armedPayload.grant_id).toBe("coldcash-g0001");
    expect(armedPayload.grantor_seat).toBe(backer);
    expect(armedPayload.pool_kx).toBe("50000");

    // === STEP 3: ACCEPT ===
    await backend.accept(promiseRef, seeker);

    // Verify acceptance record
    const acceptPath = join(TEST_RECORDS_DIR, "grants", "coldcash-g0001-accept.json");
    expect(existsSync(acceptPath)).toBe(true);

    const acceptRecord = JSON.parse(readFileSync(acceptPath, "utf-8"));
    expect(acceptRecord.grant_id).toBe("coldcash-g0001");
    expect(acceptRecord.grantee_seat).toBe(seeker);

    // After accept, the armed payload is updated with grantee_seat
    const updatedPayload = JSON.parse(readFileSync(armedPath, "utf-8"));
    expect(updatedPayload.grantee_seat).toBe(seeker);

    // Compute canonical hash from updated payload
    const canonical = JSON.stringify(updatedPayload, Object.keys(updatedPayload).sort());
    const payloadHash = keccak256(encodePacked(["string"], [canonical]));
    expect(acceptRecord.payload_hash).toBe(payloadHash);

    const stateAfterAccept = await backend.status(promiseRef);
    expect(stateAfterAccept.status).toBe("Accepted");

    // === STEP 4: ATTEST (Fixture) ===
    // Generate fixture attestation without calling GitHub API
    const fixtureDeadline = new Date(deadline * 1000);
    const fixtureMerge: GitHubPullRequest = {
      number: 42,
      merged_at: new Date(Date.now() - 3600000).toISOString(),  // 1 hour ago
      merge_commit_sha: "abc123def456",
      base: {
        ref: "main"
      }
    };

    const attestation = generateAttestationRecord(
      "coldcash-g0001",
      "testorg/testrepo",
      fixtureMerge,
      new Date()
    );

    expect(attestation.grant_id).toBe("coldcash-g0001");
    expect(attestation.window).toBe(1);
    expect(attestation.metric_value).toBe(1);
    expect(attestation.evidence_hash).not.toBeNull();

    // === STEP 5: RESOLVE ===
    // Consume attestation to create resolution record
    // metric_value = 1 → 10000 bps → full payout from curve
    const bps = attestation.metric_value === 1 ? 10000 : 0;
    await backend.resolve(promiseRef, bps, attestation.evidence_hash as Hex);

    // Verify resolution record
    const resolvePath = join(TEST_RECORDS_DIR, "grants", "coldcash-g0001-resolve.json");
    expect(existsSync(resolvePath)).toBe(true);

    const resolveRecord = JSON.parse(readFileSync(resolvePath, "utf-8"));
    expect(resolveRecord.grant_id).toBe("coldcash-g0001");
    expect(resolveRecord.window).toBe(1);
    expect(resolveRecord.metric_value).toBe(1);
    expect(resolveRecord.evidence_hash).toBe(attestation.evidence_hash);
    expect(resolveRecord.payout_kx).toBe("50000");  // Full payout
    expect(resolveRecord.settlement_ref).toBeNull();  // Placeholder until operator fills

    const finalState = await backend.status(promiseRef);
    expect(finalState.status).toBe("Paid");
    expect(finalState.paidBps).toBe(10000);

    // === STEP 6: VERIFY ALL HASHES ===
    // All records must reference the same canonical payload hash
    expect(acceptRecord.payload_hash).toBe(payloadHash);
    expect(resolveRecord.payload_hash).toBe(payloadHash);

    console.log("✓ Full KX thread verified:");
    console.log(`  Grant ID: ${promiseRef.address}`);
    console.log(`  Payload hash: ${payloadHash}`);
    console.log(`  Evidence hash: ${attestation.evidence_hash}`);
    console.log(`  Payout: ${resolveRecord.payout_kx} KX`);
  });

  it("full thread with partial payout (graded curve)", async () => {
    // Intake
    const deadline = Math.floor(Date.now() / 1000) + 604800;
    const intakeResult = await intake({
      wish: `merge PR #100 in testorg/gradedrepo by ${deadline}`,
      backerAddress: backer,
      isPublic: false,
    });

    // Create
    const promiseRef = await backend.createPromise({
      backer,
      prize: 100000n,
      acceptBy: Math.floor(Date.now() / 1000) + 86400,
      deadline,
      standardHash: intakeResult.frozen.standardHash as Hex,
      isPublic: false
    });

    // Accept
    await backend.accept(promiseRef, seeker);

    // Resolve with 50% metric (5000 bps)
    const evidenceHash = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hex;
    await backend.resolve(promiseRef, 5000, evidenceHash);

    const resolvePath = join(TEST_RECORDS_DIR, "grants", "coldcash-g0001-resolve.json");
    const resolveRecord = JSON.parse(readFileSync(resolvePath, "utf-8"));

    expect(resolveRecord.metric_value).toBe(0.5);
    expect(resolveRecord.payout_kx).toBe("0");  // Below threshold per curve

    const finalState = await backend.status(promiseRef);
    expect(finalState.status).toBe("Paid");
    expect(finalState.paidBps).toBe(5000);
  });

  it("full thread with fail-closed (null metric)", async () => {
    // Intake
    const deadline = Math.floor(Date.now() / 1000) + 604800;
    const intakeResult = await intake({
      wish: `merge PR #200 in testorg/failrepo by ${deadline}`,
      backerAddress: backer,
      isPublic: false,
    });

    // Create
    const promiseRef = await backend.createPromise({
      backer,
      prize: 75000n,
      acceptBy: Math.floor(Date.now() / 1000) + 86400,
      deadline,
      standardHash: intakeResult.frozen.standardHash as Hex,
      isPublic: false
    });

    // Accept
    await backend.accept(promiseRef, seeker);

    // Attest with null metric (no qualifying merge)
    const attestation = generateAttestationRecord(
      "coldcash-g0001",
      "testorg/failrepo",
      null,  // No merge found
      new Date()
    );

    expect(attestation.metric_value).toBeNull();
    expect(attestation.evidence_hash).toBeNull();

    // Resolve with 0 bps (fail-closed)
    const evidenceHash = "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;
    await backend.resolve(promiseRef, 0, evidenceHash);

    const resolvePath = join(TEST_RECORDS_DIR, "grants", "coldcash-g0001-resolve.json");
    const resolveRecord = JSON.parse(readFileSync(resolvePath, "utf-8"));

    expect(resolveRecord.metric_value).toBeNull();
    expect(resolveRecord.payout_kx).toBe("0");
    expect(resolveRecord.settlement_ref).toBeNull();

    const finalState = await backend.status(promiseRef);
    expect(finalState.status).toBe("Paid");
    expect(finalState.paidBps).toBe(0);
  });
});
