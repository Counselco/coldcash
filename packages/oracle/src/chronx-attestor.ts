import { keccak256, encodePacked, type Hex } from "viem";

export interface ChronXAttestationRecord {
  grant_id: string;
  window: number;
  metric_value: number | null;
  evidence_hash: Hex | null;
  evidence_bundle: EvidenceBundle | null;
  generated_at: string;
  comment: string;
}

export interface EvidenceBundle {
  repo: string;
  pr_number: number;
  merge_commit_sha: string;
  merged_at: string;
  source: "github-rest";
}

export interface GitHubPullRequest {
  number: number;
  merged_at: string | null;
  merge_commit_sha: string | null;
  base: {
    ref: string;
  };
}

export function computeEvidenceHash(evidence: EvidenceBundle): Hex {
  // Canonical evidence bundle format - order matters for hash stability
  const canonical = JSON.stringify({
    repo: evidence.repo,
    prNumber: evidence.pr_number,
    mergeCommitSha: evidence.merge_commit_sha,
    mergedAt: evidence.merged_at,
    source: evidence.source
  });

  return keccak256(encodePacked(["string"], [canonical]));
}

export function findEarliestQualifyingMerge(
  pulls: GitHubPullRequest[],
  deadline: Date
): GitHubPullRequest | null {
  // Filter for PRs merged to main with merged_at strictly before deadline
  const qualifying = pulls
    .filter(pr =>
      pr.merged_at !== null &&
      pr.merge_commit_sha !== null &&
      pr.base.ref === "main" &&
      new Date(pr.merged_at) < deadline
    )
    .sort((a, b) =>
      new Date(a.merged_at!).getTime() - new Date(b.merged_at!).getTime()
    );

  return qualifying[0] || null;
}

export function generateAttestationRecord(
  grantId: string,
  repo: string,
  earliestMerge: GitHubPullRequest | null,
  generatedAt: Date = new Date()
): ChronXAttestationRecord {
  if (!earliestMerge) {
    // Fail-closed semantics: Null window when no qualifying merge
    return {
      grant_id: grantId,
      window: 1,
      metric_value: null,
      evidence_hash: null,
      evidence_bundle: null,
      generated_at: generatedAt.toISOString(),
      comment: "UNSIGNED record - signature is witness operator's act on ChronX side"
    };
  }

  // Build canonical evidence bundle
  const evidenceBundle: EvidenceBundle = {
    repo,
    pr_number: earliestMerge.number,
    merge_commit_sha: earliestMerge.merge_commit_sha!,
    merged_at: earliestMerge.merged_at!,
    source: "github-rest"
  };

  const evidenceHash = computeEvidenceHash(evidenceBundle);

  return {
    grant_id: grantId,
    window: 1,
    metric_value: 1,
    evidence_hash: evidenceHash,
    evidence_bundle: evidenceBundle,
    generated_at: generatedAt.toISOString(),
    comment: "UNSIGNED record - signature is witness operator's act on ChronX side"
  };
}
