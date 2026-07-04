# ColdCash P3 Local Demo

## One-Command Bring-Up

From repo root:

```bash
# Terminal 1: Start local anvil (uses fixed port 8545 by default)
anvil

# Terminal 2: Start API dev server (optional - for API routes)
cd packages/api && pnpm dev

# Terminal 3: Start web dev server
cd packages/web && pnpm dev
```

Then visit http://localhost:3000 for the demo UI flows.

## Demo Scenarios

### 1. GitHub-Merge Bounty (Anchored, Deterministic)

**Backer Flow:**
1. Go to `/backer`
2. Enter wish: `merge PR #42 in testorg/testrepo by 1735689600`
3. Review frozen standard (shows deterministic github-merge anchor)
4. One-tap fund (demo mode - simulates approve+create)

**Seeker Flow:**
1. Go to `/seeker`
2. Enter promise ID (escrow address)
3. Review frozen standard + acceptance clock
4. Accept (demo mode - simulates accept tx)

**Resolution:**
- Oracle receives GitHub webhook on merge
- Attestor signs verdict (10000 bps)
- Funds auto-released to seeker
- View at `/status`

### 2. Manual-Attestation with Consent (Subjective)

**Backer Flow:**
1. Go to `/backer`
2. Enter wish: `clean my room, i understand this is subjective`
3. Review frozen standard (manual-attestation)
4. Fund (consent flag bypasses subjective gate)

**Seeker Flow:**
1. Accept promise
2. Submit photo evidence
3. Backer reviews dossier
4. Backer approves at partial bps (e.g., 3000 = 30%)
5. Attestor signs → split settlement (30% to seeker, 70% refund to backer)

## Test Execution

```bash
# All tests in parallel (port fix ensures no collisions)
pnpm -r test

# Expected: 40/40 green
# - contracts: 17/17 forge tests
# - shared: 4/4 vitest
# - api: 15/15 vitest (intake + e2e + lifecycle)
# - oracle: 4/4 vitest
# - web: 0 (demo UI, no tests)
```

## Key P3 Components

- **IntakeEngine** (`packages/api/src/intake/engine.ts`): deterministic wish → frozen standard
- **FixtureModelProvider** (`packages/api/src/model/FixtureModelProvider.ts`): no AI, no keys
- **DemoWalletProvider** (`packages/web/src/lib/wallet/DemoWalletProvider.ts`): anvil dev accounts
- **Demo UI** (`packages/web/src/app/{backer,seeker,status}`): Next.js App Router flows
- **E2E Tests** (`packages/api/src/__tests__/e2e.integration.test.ts`): intake integration proof

## Port Configuration

Integration tests use distinct anvil ports to enable parallel execution:
- API lifecycle tests: port 8545
- Oracle tests: port 8546
- All configurable via `ANVIL_PORT` env var

## Acceptance Proof

```bash
# Port fix: parallel test suite green
pnpm -r test
# ✓ contracts 17/17, shared 4/4, api 15/15, oracle 4/4 = 40/40

# Forge tests still green
cd packages/contracts && forge test
# ✓ 17/17

# Everything builds including web
pnpm -r build
# ✓ contracts, shared, api, oracle, web all clean
```

## Prohibitions Verified

✓ No .sol edits (contracts untouched)
✓ No external network calls in tests (all anvil local)
✓ No Privy integration (DemoWalletProvider only)
✓ No AI keys (FixtureModelProvider only)
✓ No production keys
✓ No push (local only)
✓ No sudo
