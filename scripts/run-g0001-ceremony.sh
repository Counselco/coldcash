#!/usr/bin/env bash
#
# coldcash-g0001 Ceremony Runner
#
# Completes the g0001 ceremony: GitHub PR creation/merge, attestation, payout prep
#
# Usage:
#   export GITHUB_TOKEN=ghp_...    # GitHub PAT with repo scope
#   ./scripts/run-g0001-ceremony.sh
#
# Or one-liner:
#   GITHUB_TOKEN=ghp_... ./scripts/run-g0001-ceremony.sh
#
# To get a token:
#   https://github.com/settings/tokens/new
#   Scopes needed: repo (full control of private repositories)
#   Org access: Counselco

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Check for GitHub token
if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "✗ Error: GITHUB_TOKEN environment variable not set"
  echo ""
  echo "To run this ceremony:"
  echo "  1. Generate a GitHub Personal Access Token at:"
  echo "     https://github.com/settings/tokens/new"
  echo "  2. Grant 'repo' scope and authorize for Counselco org"
  echo "  3. Export the token:"
  echo "     export GITHUB_TOKEN=ghp_your_token_here"
  echo "  4. Re-run this script"
  exit 1
fi

echo "=== coldcash-g0001 Ceremony Runner ==="
echo ""

# Step 1-4: GitHub ceremony (create branch, file, PR, merge)
echo "→ Running GitHub ceremony (branch, PR, merge)..."
node scripts/g0001-ceremony.mjs

if [ $? -ne 0 ]; then
  echo "✗ Ceremony failed at GitHub step"
  exit 1
fi

# Load ceremony results
if [ ! -f out/g0001-ceremony-state.json ]; then
  echo "✗ Ceremony state file not found"
  exit 1
fi

PR_NUMBER=$(node -e 'console.log(JSON.parse(require("fs").readFileSync("out/g0001-ceremony-state.json")).pr_number)')
MERGE_SHA=$(node -e 'console.log(JSON.parse(require("fs").readFileSync("out/g0001-ceremony-state.json")).merge_commit_sha)')
MERGED_AT=$(node -e 'console.log(JSON.parse(require("fs").readFileSync("out/g0001-ceremony-state.json")).merged_at)')
DEADLINE=$(node -e 'console.log(JSON.parse(require("fs").readFileSync("out/g0001-ceremony-state.json")).deadline)')
PR_URL="https://github.com/Counselco/coldcash-anchor-test/pull/$PR_NUMBER"

echo "✓ GitHub ceremony complete"
echo "  PR: #$PR_NUMBER ($PR_URL)"
echo "  Merge: $MERGE_SHA at $MERGED_AT"
echo ""

# Step 5: Attestation
echo "→ Running attestation (oracle)..."
pnpm --filter @coldcash/oracle attest-chronx -- \
  --grant-id coldcash-g0001 \
  --repo Counselco/coldcash-anchor-test \
  --deadline "$DEADLINE" \
  | tee out/g0001-attestation.log

if [ ${PIPESTATUS[0]} -ne 0 ]; then
  echo "✗ Attestation failed"
  exit 1
fi

EVIDENCE_HASH=$(grep "Evidence hash:" out/g0001-attestation.log | awk '{print $3}')

echo "✓ Attestation complete"
echo "  Evidence hash: $EVIDENCE_HASH"
echo ""

# Step 6: Resolution + Payout Preparation
echo "→ Preparing payout..."

# Check if resolution helper exists
if pnpm --filter @coldcash/api list 2>/dev/null | grep -q "prepare-payout"; then
  # Create resolution record (metric=1 => full pool payout per curve)
  # For g0001, assume pool_kx from armed payload (or default)
  # Resolution format: { grant_id, metric_value, evidence_hash, payout_curve }

  RESOLUTION_FILE="out/g0001-resolution.json"

  # Generate resolution record
  cat > "$RESOLUTION_FILE" <<EOF
{
  "grant_id": "coldcash-g0001",
  "metric_value": 1,
  "evidence_hash": "$EVIDENCE_HASH",
  "pr_number": $PR_NUMBER,
  "merge_commit_sha": "$MERGE_SHA",
  "merged_at": "$MERGED_AT",
  "deadline": "$DEADLINE"
}
EOF

  echo "  Resolution record: $RESOLUTION_FILE"

  # Run payout preparer
  pnpm --filter @coldcash/api prepare-payout -- --resolution "$RESOLUTION_FILE" \
    | tee out/g0001-payout.log

  if [ ${PIPESTATUS[0]} -ne 0 ]; then
    echo "✗ Payout preparation failed"
    exit 1
  fi

  # Extract the chronx-wallet command
  WALLET_CMD=$(grep -A 5 "chronx-wallet transfer" out/g0001-payout.log || echo "COMMAND_NOT_FOUND")

  echo "✓ Payout prepared"
  echo ""
else
  echo "⚠ Payout preparer not found (skipping step 6)"
  echo "  Manual resolution required"
  WALLET_CMD="[Payout preparer not available - manual resolution required]"
  echo ""
fi

# Final Summary
echo "=== CEREMONY COMPLETE ==="
echo ""
echo "GitHub PR:"
echo "  URL: $PR_URL"
echo "  Number: #$PR_NUMBER"
echo "  Merge SHA: $MERGE_SHA"
echo "  Merged at: $MERGED_AT"
echo ""
echo "Attestation:"
echo "  Evidence hash: $EVIDENCE_HASH"
echo "  Record: out/attestations/coldcash-g0001-w1.json"
echo ""
echo "Payout:"
echo "  Resolution: out/g0001-resolution.json"
if [ "$WALLET_CMD" != "[Payout preparer not available - manual resolution required]" ]; then
  echo "  Command for Joseph:"
  echo ""
  echo "    $WALLET_CMD"
  echo ""
  echo "  ⚠ This command requires review and signature by Joseph"
  echo "  ⚠ No keys were used; tooling did not sign"
else
  echo "  Status: Manual preparation required"
fi
echo ""
echo "🎉 coldcash-g0001: First promise proven"
