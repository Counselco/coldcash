import { describe, it, expect } from "vitest";
import {
  type GitHubPullRequest,
  findEarliestQualifyingMerge,
  generateAttestationRecord,
  computeEvidenceHash
} from "../chronx-attestor.js";

describe("ChronX Attestor", () => {
  const FIXED_DATE = new Date("2026-07-04T00:00:00.000Z");

  const createPR = (
    number: number,
    mergedAt: string | null,
    mergeCommitSha: string | null,
    baseRef: string = "main"
  ): GitHubPullRequest => ({
    number,
    merged_at: mergedAt,
    merge_commit_sha: mergeCommitSha,
    base: { ref: baseRef }
  });

  describe("findEarliestQualifyingMerge", () => {
    it("qualifying merge → returns earliest PR", () => {
      const deadline = new Date("2026-07-03T12:00:00Z");
      const pulls = [
        createPR(3, "2026-07-03T11:00:00Z", "sha3"),
        createPR(1, "2026-07-03T09:00:00Z", "sha1"),
        createPR(2, "2026-07-03T10:00:00Z", "sha2")
      ];

      const result = findEarliestQualifyingMerge(pulls, deadline);

      expect(result).not.toBeNull();
      expect(result?.number).toBe(1);
      expect(result?.merged_at).toBe("2026-07-03T09:00:00Z");
    });

    it("no merge → returns null", () => {
      const deadline = new Date("2026-07-03T12:00:00Z");
      const pulls = [
        createPR(1, null, null),
        createPR(2, null, null)
      ];

      const result = findEarliestQualifyingMerge(pulls, deadline);

      expect(result).toBeNull();
    });

    it("merge after deadline → returns null", () => {
      const deadline = new Date("2026-07-03T12:00:00Z");
      const pulls = [
        createPR(1, "2026-07-03T13:00:00Z", "sha1"),
        createPR(2, "2026-07-03T14:00:00Z", "sha2")
      ];

      const result = findEarliestQualifyingMerge(pulls, deadline);

      expect(result).toBeNull();
    });

    it("merge at exact deadline → returns null (strictly before)", () => {
      const deadline = new Date("2026-07-03T12:00:00Z");
      const pulls = [
        createPR(1, "2026-07-03T12:00:00Z", "sha1")
      ];

      const result = findEarliestQualifyingMerge(pulls, deadline);

      expect(result).toBeNull();
    });

    it("merge to non-main branch → excluded", () => {
      const deadline = new Date("2026-07-03T12:00:00Z");
      const pulls = [
        createPR(1, "2026-07-03T09:00:00Z", "sha1", "develop"),
        createPR(2, "2026-07-03T10:00:00Z", "sha2", "feature")
      ];

      const result = findEarliestQualifyingMerge(pulls, deadline);

      expect(result).toBeNull();
    });

    it("mixed branches → returns only main branch merge", () => {
      const deadline = new Date("2026-07-03T12:00:00Z");
      const pulls = [
        createPR(1, "2026-07-03T09:00:00Z", "sha1", "develop"),
        createPR(2, "2026-07-03T10:00:00Z", "sha2", "main"),
        createPR(3, "2026-07-03T08:00:00Z", "sha3", "feature")
      ];

      const result = findEarliestQualifyingMerge(pulls, deadline);

      expect(result).not.toBeNull();
      expect(result?.number).toBe(2);
    });

    it("missing merge_commit_sha → excluded", () => {
      const deadline = new Date("2026-07-03T12:00:00Z");
      const pulls = [
        createPR(1, "2026-07-03T09:00:00Z", null)
      ];

      const result = findEarliestQualifyingMerge(pulls, deadline);

      expect(result).toBeNull();
    });
  });

  describe("generateAttestationRecord", () => {
    it("qualifying merge → metric_value = 1 with evidence", () => {
      const pr = createPR(42, "2026-07-03T10:00:00Z", "abc123def456");
      const record = generateAttestationRecord(
        "grant-001",
        "Counselco/coldcash-anchor-test",
        pr,
        FIXED_DATE
      );

      expect(record.grant_id).toBe("grant-001");
      expect(record.window).toBe(1);
      expect(record.metric_value).toBe(1);
      expect(record.evidence_hash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(record.evidence_bundle).toEqual({
        repo: "Counselco/coldcash-anchor-test",
        pr_number: 42,
        merge_commit_sha: "abc123def456",
        merged_at: "2026-07-03T10:00:00Z",
        source: "github-rest"
      });
      expect(record.generated_at).toBe("2026-07-04T00:00:00.000Z");
      expect(record.comment).toContain("UNSIGNED");
    });

    it("no merge → metric_value = null (Null window)", () => {
      const record = generateAttestationRecord(
        "grant-002",
        "Counselco/coldcash-anchor-test",
        null,
        FIXED_DATE
      );

      expect(record.grant_id).toBe("grant-002");
      expect(record.window).toBe(1);
      expect(record.metric_value).toBeNull();
      expect(record.evidence_hash).toBeNull();
      expect(record.evidence_bundle).toBeNull();
      expect(record.generated_at).toBe("2026-07-04T00:00:00.000Z");
    });

    it("evidence hash is stable for fixed fixture", () => {
      const pr = createPR(42, "2026-07-03T10:00:00Z", "abc123def456");
      const record1 = generateAttestationRecord(
        "grant-001",
        "Counselco/coldcash-anchor-test",
        pr,
        FIXED_DATE
      );
      const record2 = generateAttestationRecord(
        "grant-001",
        "Counselco/coldcash-anchor-test",
        pr,
        FIXED_DATE
      );

      expect(record1.evidence_hash).toBe(record2.evidence_hash);
      // Assert exact hash for regression detection
      expect(record1.evidence_hash).toBe("0x0839fb353fdb721b25e0881243350ff3f7d12d1bf3f6f8ff3925edaa36ace441");
    });
  });

  describe("computeEvidenceHash", () => {
    it("deterministic hash for same input", () => {
      const evidence = {
        repo: "Counselco/coldcash-anchor-test",
        pr_number: 42,
        merge_commit_sha: "abc123",
        merged_at: "2026-07-03T10:00:00Z",
        source: "github-rest" as const
      };

      const hash1 = computeEvidenceHash(evidence);
      const hash2 = computeEvidenceHash(evidence);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it("different inputs → different hashes", () => {
      const evidence1 = {
        repo: "Counselco/coldcash-anchor-test",
        pr_number: 42,
        merge_commit_sha: "abc123",
        merged_at: "2026-07-03T10:00:00Z",
        source: "github-rest" as const
      };

      const evidence2 = {
        ...evidence1,
        pr_number: 43
      };

      const hash1 = computeEvidenceHash(evidence1);
      const hash2 = computeEvidenceHash(evidence2);

      expect(hash1).not.toBe(hash2);
    });
  });
});
