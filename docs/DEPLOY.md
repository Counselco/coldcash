# ColdCash Deployment Runbook — Arbitrum Sepolia

This runbook guides the human operator through deploying ColdCash contracts to Arbitrum Sepolia testnet.

**Critical safety:** All secrets (deployer private key, attestor address) are supplied as runtime environment variables ONLY. Never write key material to any file.

---

## Prerequisites

### 1. Deployer Wallet (Funded with Sepolia ETH)

You need a funded wallet on Arbitrum Sepolia to pay for deployment gas.

**Get Sepolia ETH:**
- **Arbitrum Sepolia Bridge Faucet:** https://bridge.arbitrum.io/?destinationChain=arbitrum-sepolia
- **Alchemy Sepolia Faucet:** https://www.alchemy.com/faucets/arbitrum-sepolia
- **QuickNode Faucet:** https://faucet.quicknode.com/arbitrum/sepolia
- **Chainlink Faucet:** https://faucets.chain.link/arbitrum-sepolia

You'll need approximately 0.01 Sepolia ETH for gas (deployment costs ~500k gas total).

**Export your deployer private key:**
```bash
export PRIVATE_KEY="0x..."  # Your deployer wallet private key (64 hex chars)
```

### 2. USDC Address (Canonical Arbitrum Sepolia USDC)

**CRITICAL:** The USDC address MUST be verified against Circle's official documentation at deployment time. Never trust an address from this repo or any third-party source.

**Official Circle documentation:**
- Circle USDC on Arbitrum Sepolia: https://developers.circle.com/stablecoins/docs/usdc-on-test-networks
- Expected format: `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` (verify this!)

**When ready to deploy, export:**
```bash
export USDC_ADDRESS="0x..."  # Circle's canonical Arbitrum Sepolia USDC (verified against official docs)
```

### 3. Fee Recipient Address

This is where the 3% public-lane publication fees are sent. Can be any address you control.

```bash
export FEE_RECIPIENT="0x..."  # Address to receive publication fees
```

### 4. Attestor Address

This is the ColdCash attestor's public address (NOT the private key). The attestor service will hold the corresponding private key.

```bash
export ATTESTOR_ADDRESS="0x..."  # ColdCash attestor public address
```

**Security note:** The attestor key must be generated securely and stored separately. The oracle service (packages/oracle) will require the private key via `COLDCASH_ATTESTOR_KEY` env var. If that key is absent, the service fails loud and refuses to start.

### 5. RPC URL

You need an RPC endpoint for Arbitrum Sepolia. Free options:

- **Alchemy:** https://dashboard.alchemy.com/
- **Infura:** https://infura.io/
- **QuickNode:** https://www.quicknode.com/
- **Public RPC:** https://sepolia-rollup.arbitrum.io/rpc (rate-limited, not recommended for production)

```bash
export RPC_URL="https://arb-sepolia.g.alchemy.com/v2/YOUR-API-KEY"
```

---

## Deployment

### Step 1: Verify All Environment Variables

Before deploying, confirm all required variables are set:

```bash
echo "Deployer: ${PRIVATE_KEY:0:10}..." # Should show first 10 chars
echo "USDC: $USDC_ADDRESS"
echo "Fee Recipient: $FEE_RECIPIENT"
echo "Attestor: $ATTESTOR_ADDRESS"
echo "RPC: $RPC_URL"
```

**Double-check the USDC address against Circle's official docs!**

### Step 2: Run Deployment Script

From the repository root:

```bash
cd packages/contracts

forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --broadcast \
  --verify \
  -vvv
```

**Flags explained:**
- `--rpc-url`: Your Arbitrum Sepolia RPC endpoint
- `--private-key`: Deployer wallet private key (supplied at runtime, never saved)
- `--broadcast`: Actually send transactions (omit for dry-run)
- `--verify`: Verify contracts on Arbiscan (requires ETHERSCAN_API_KEY env var; optional)
- `-vvv`: Verbose output

**Expected output:**
- Deployment transactions sent
- `Deployed NamedAttestorAdapter at: 0x...`
- `Deployed PromiseFactory at: 0x...`
- JSON block with all addresses (see below)

### Step 3: Extract Deployment JSON

The script prints a machine-readable JSON block at the end:

```
=== DEPLOYMENT JSON ===
{
  "chainId": 421614,
  "factory": "0x...",
  "adapter": "0x...",
  "usdc": "0x..."
}
=== END DEPLOYMENT JSON ===
```

**Copy this JSON** — you'll paste it into `packages/shared/src/deployments.ts` in the next step.

### Step 4: Record Addresses in Registry

Edit `packages/shared/src/deployments.ts` and paste the JSON into the `421614` entry:

```typescript
export const deployments: Record<number, Deployment> = {
  421614: {
    chainId: 421614,
    factory: "0x..." as Address,  // From JSON output
    adapter: "0x..." as Address,  // From JSON output
    usdc: "0x..." as Address,     // From JSON output
  },
};
```

Commit this change:

```bash
git add packages/shared/src/deployments.ts
git commit -m "chore: record Arbitrum Sepolia deployment addresses"
```

---

## Post-Deployment Smoke Test

After deployment, verify the contracts are working correctly with a minimal lifecycle test.

### Smoke Test: Create → Accept → Resolve

This replicates the full promise lifecycle with a $1 USDC promise:

```bash
# 1. Fund your test wallet with testnet USDC from Circle's faucet
# Circle Testnet USDC Faucet: https://faucet.circle.com/
# Request USDC for your deployer address on Arbitrum Sepolia

# 2. Approve the factory to spend USDC
cast send "$USDC_ADDRESS" \
  "approve(address,uint256)" \
  "$FACTORY_ADDRESS" \
  1000000000000 \
  --rpc-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY"

# 3. Create a $1 promise (1e6 = $1 in 6-decimal USDC)
# acceptBy = now + 1 day, deadline = now + 7 days
ACCEPT_BY=$(date -u -v+1d +%s)  # macOS
DEADLINE=$(date -u -v+7d +%s)   # macOS
# Linux: ACCEPT_BY=$(date -u -d '+1 day' +%s)

cast send "$FACTORY_ADDRESS" \
  "createPromise(uint256,uint64,uint64,bytes32,address,address)" \
  1000000 \
  "$ACCEPT_BY" \
  "$DEADLINE" \
  "0x$(echo -n 'test-standard-smoke' | sha256sum | cut -d' ' -f1)" \
  "0x0000000000000000000000000000000000000000" \
  "0x0000000000000000000000000000000000000000" \
  --rpc-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY"

# 4. Get the escrow address from the PromiseCreated event logs
# (Use Arbiscan or parse the tx receipt)

# 5. Accept the promise (as seeker)
SEEKER_KEY="0x..."  # A different wallet with Sepolia ETH
cast send "$ESCROW_ADDRESS" \
  "accept()" \
  --rpc-url "$RPC_URL" \
  --private-key "$SEEKER_KEY"

# 6. Resolve the promise (full payout)
# Sign the attestation with the attestor key
EVIDENCE_HASH="0x$(echo -n 'test-evidence' | sha256sum | cut -d' ' -f1)"
# TODO: Sign and relay via NamedAttestorAdapter.relay()
# This step requires the attestor private key and signature generation
```

**Expected results:**
- Factory creates escrow ✅
- USDC transferred to escrow ✅
- Seeker accepts ✅
- Oracle resolves → USDC sent to seeker ✅
- Escrow state = `Paid` ✅

---

## Running the Oracle Service Against Sepolia

Once contracts are deployed, you can run the oracle attestation service (packages/oracle) against Sepolia.

**Required environment variables:**

```bash
export COLDCASH_ATTESTOR_KEY="0x..."  # Attestor private key (64 hex chars)
export GITHUB_TOKEN="ghp_..."         # GitHub PAT for github-merge anchor (poll mode)
export RPC_URL="https://arb-sepolia.g.alchemy.com/v2/..."
export CHAIN_ID=421614
export FACTORY_ADDRESS="0x..."        # From deployment JSON
export ADAPTER_ADDRESS="0x..."        # From deployment JSON
```

**Start the service:**

```bash
cd packages/oracle
pnpm start
```

**Fail-loud behavior:**
- If `COLDCASH_ATTESTOR_KEY` is missing → service exits immediately with error
- If the key doesn't match the on-chain attestor address → first relay will fail
- Never silently degrade or skip attestation

**Oracle modes:**
- **Poll mode** (default): periodically checks for pending promises and evaluates them
- **Webhook mode**: listens for GitHub webhooks on merge events (requires public endpoint)

---

## Troubleshooting

### Deployment fails with "insufficient funds"
→ Fund your deployer wallet with more Sepolia ETH (see Prerequisites).

### Deployment fails with "invalid USDC address"
→ Verify the USDC address against Circle's official documentation. Do NOT trust cached addresses.

### Oracle service won't start
→ Check that `COLDCASH_ATTESTOR_KEY` is set and matches the `ATTESTOR_ADDRESS` used in deployment.

### Smoke test fails on accept()
→ Ensure the seeker wallet has Sepolia ETH for gas.

### Contract verification fails
→ Set `ETHERSCAN_API_KEY` environment variable with an Arbiscan API key (get one at https://arbiscan.io/myapikey).

---

## Security Checklist

Before going live:

- [ ] Deployer private key supplied as runtime env only (never written to file)
- [ ] Attestor private key generated securely and stored separately
- [ ] USDC address verified against Circle's official documentation
- [ ] Fee recipient address is controlled and secure
- [ ] RPC endpoint is reliable and rate-limit-aware
- [ ] Deployment addresses committed to `deployments.ts`
- [ ] Smoke test passed (full lifecycle green)
- [ ] Oracle service tested against Sepolia and failing loud when key is missing

---

## Next Steps

After successful Sepolia deployment:

1. Update the web app (packages/web) to point to Arbitrum Sepolia (chain ID 421614)
2. Test the full backer/seeker flow with Privy embedded wallets
3. Deploy the API service (packages/api) with Sepolia RPC and deployment addresses
4. Run the github-merge anchor against a test repository
5. Execute a full end-to-end demo: create → accept → merge PR → auto-payout

**Only after Sepolia is stable:** consider mainnet deployment to Arbitrum One (chain ID 42161).
