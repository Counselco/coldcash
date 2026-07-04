import { describe, it, expect } from "vitest";
import { IntakeEngine } from "../intake/engine.js";
import { standardHash } from "@coldcash/shared";
import { intake } from "../routes/promises.js";
import { getAddress } from "viem";

/**
 * E2E tests for P3: Intake engine + API integration
 * On-chain lifecycle already verified in lifecycle.integration.test.ts
 * This suite proves intake → frozen standard → standardHash flow
 */

describe("E2E: Intake Integration", () => {
  it("(github-merge) intake → frozen standard with valid hash", async () => {
    const result = await intake({
      wish: "merge PR #42 in testorg/testrepo by 1735689600",
      backerAddress: getAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"),
      isPublic: false,
    });

    expect(result.kind).toBe("github-merge");
    expect(result.isSubjective).toBe(false);
    expect(result.requiresConsent).toBe(false);
    expect(result.frozen.standardHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.frozen.goal).toContain("PR #42");
    expect(result.frozen.goal).toContain("testorg/testrepo");
  });

  it("(manual-attestation) structural pass → not subjective", async () => {
    const result = await intake({
      wish: "submit photo proof of completed homework",
      backerAddress: getAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"),
      isPublic: false,
    });

    expect(result.kind).toBe("manual-attestation");
    expect(result.isSubjective).toBe(false);
    expect(result.requiresConsent).toBe(false);
    expect(result.frozen.standardHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("(manual-attestation) subjective flagged without consent → requires consent", async () => {
    const result = await intake({
      wish: "clean my room",
      backerAddress: getAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"),
      isPublic: false,
    });

    expect(result.kind).toBe("manual-attestation");
    expect(result.isSubjective).toBe(true);
    expect(result.requiresConsent).toBe(true);
  });

  it("(manual-attestation) subjective with consent → accepted", async () => {
    const result = await intake({
      wish: "clean my room, i understand this is subjective",
      backerAddress: getAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"),
      isPublic: false,
    });

    expect(result.kind).toBe("manual-attestation");
    expect(result.isSubjective).toBe(true);
    expect(result.requiresConsent).toBe(false);
  });

  it("standardHash deterministic: same input → same hash", () => {
    const spec1 = {
      kind: "github-merge" as const,
      repo: "testorg/testrepo",
      prNumber: 42,
      deadline: 1735689600,
    };

    const spec2 = {
      kind: "github-merge" as const,
      repo: "testorg/testrepo",
      prNumber: 42,
      deadline: 1735689600,
    };

    const hash1 = standardHash(spec1);
    const hash2 = standardHash(spec2);

    expect(hash1).toBe(hash2);
  });

  it("standardHash collision resistance: different input → different hash", () => {
    const spec1 = {
      kind: "github-merge" as const,
      repo: "testorg/testrepo",
      prNumber: 42,
      deadline: 1735689600,
    };

    const spec2 = {
      kind: "github-merge" as const,
      repo: "testorg/testrepo",
      prNumber: 43,
      deadline: 1735689600,
    };

    const hash1 = standardHash(spec1);
    const hash2 = standardHash(spec2);

    expect(hash1).not.toBe(hash2);
  });
});
