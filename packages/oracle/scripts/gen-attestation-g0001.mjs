import { keccak256, encodePacked } from "viem";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const evidenceBundle = {
  repo: "Counselco/coldcash-anchor-test",
  pr_number: 1,
  merge_commit_sha: "c786c35683c6343dff09d102cb5a00c126a959bc",
  merged_at: "2026-07-05T11:35:58Z",
  source: "github-rest"
};

// Canonical evidence bundle format - order matters for hash stability
const canonical = JSON.stringify({
  repo: evidenceBundle.repo,
  prNumber: evidenceBundle.pr_number,
  mergeCommitSha: evidenceBundle.merge_commit_sha,
  mergedAt: evidenceBundle.merged_at,
  source: evidenceBundle.source
});

const evidenceHash = keccak256(encodePacked(["string"], [canonical]));

const attestationRecord = {
  grant_id: "coldcash-g0001",
  window: 1,
  metric_value: 1,
  evidence_hash: evidenceHash,
  evidence_bundle: evidenceBundle,
  generated_at: new Date().toISOString(),
  comment: "UNSIGNED record - signature is witness operator's act on ChronX side"
};

// Write to records directory
const recordsDir = join(__dirname, "../../../records/attestations");
const outputPath = join(recordsDir, "coldcash-g0001-w1.json");
writeFileSync(outputPath, JSON.stringify(attestationRecord, null, 2));

console.log(JSON.stringify(attestationRecord, null, 2));
console.log("\n✓ Attestation written to:", outputPath);
console.log("Evidence Hash:", evidenceHash);
