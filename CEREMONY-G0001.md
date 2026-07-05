# coldcash-g0001 Ceremony Instructions

## Current Status

**Armed Payload**: Not found locally (using far-future deadline 2030-01-01 / timestamp 1893456000)  
**Repository**: Counselco/coldcash-anchor-test (empty, ready for ceremony)  
**Scripts Ready**: ✓ All ceremony scripts created

## Prerequisites

GitHub Personal Access Token with:
- Scope: `repo` (full control)
- Organization access: Counselco

Generate at: https://github.com/settings/tokens/new

## Quick Start

```bash
# 1. Set GitHub token
export GITHUB_TOKEN=ghp_your_token_here

# 2. Run complete ceremony
./scripts/run-g0001-ceremony.sh
```

## What the Ceremony Does

### Steps 1-4: GitHub (automated via scripts/g0001-ceremony.mjs)
1. Check Counselco/coldcash-anchor-test exists
2. Create `genesis-promise` branch from main (or create initial commit if empty)
3. Create `proofs/coldcash-g0001.md` with: "First promise on Upon Proof. Grant coldcash-g0001. The machine proves; the human signs."
4. Create and merge PR #1: "coldcash-g0001: the first kept promise"

### Step 5: Attestation (automated via pnpm)
```bash
pnpm --filter @coldcash/oracle attest-chronx \
  --grant-id coldcash-g0001 \
  --repo Counselco/coldcash-anchor-test \
  --deadline 1893456000
```

Produces:
- Evidence hash (SHA-256 of PR metadata)
- Attestation record: `out/attestations/coldcash-g0001-w1.json`
- **unsigned** (oracle never holds keys)

### Step 6: Payout Preparation (automated via pnpm)
```bash
pnpm --filter @coldcash/api prepare-payout \
  --resolution out/g0001-resolution.json
```

Produces:
- Payout KX calculation (metric=1 => full pool per curve)
- `chronx-wallet transfer` command (unsigned, for Joseph to review and sign)

## Manual Fallback

If `run-g0001-ceremony.sh` fails, run steps individually:

```bash
# Set token
export GITHUB_TOKEN=ghp_...

# GitHub ceremony
node scripts/g0001-ceremony.mjs

# Attestation
pnpm --filter @coldcash/oracle attest-chronx \
  --grant-id coldcash-g0001 \
  --repo Counselco/coldcash-anchor-test \
  --deadline 1893456000

# Payout (if prepare-payout exists)
pnpm --filter @coldcash/api prepare-payout \
  --resolution out/g0001-resolution.json
```

## Expected Output

```
PR URL: https://github.com/Counselco/coldcash-anchor-test/pull/1
Merge SHA: <commit_hash>
Merged at: <timestamp>
Evidence hash: <sha256>

Payout command (for Joseph to review and sign):
  chronx-wallet transfer --to <grantee_seat> --amount <kx> --memo "coldcash-g0001 payout" --review
```

## Security Notes

- Token NEVER printed or logged
- No keys used by scripts
- Nothing signed by tooling
- Joseph reviews and signs the final `chronx-wallet transfer` command

## Troubleshooting

**"GitHub token not found"**  
→ `export GITHUB_TOKEN=ghp_...` before running script

**"Permission denied" on API calls**  
→ Ensure token has `repo` scope and Counselco org access

**"Branch already exists"**  
→ Ceremony already started; check GitHub PR state

**"Payout preparer not found"**  
→ Manual resolution required (see API package docs)
