# ChronX On-Chain Backend

Real ChronX transaction construction and submission for Type_G grants (node v9.5.0).

## Safety Interlock (CRITICAL)

**ALL live RPC submission is gated behind `CHRONX_LIVE_SUBMIT` env flag (default: false).**

The ChronX chain is freshly genesis'd with an **EMPTY DAG**. The FIRST real transaction permanently retires the rollback window (to checkpoint b629e31f). This must be a conscious operator act, NEVER a side effect of a build or test.

### Default Behavior (Safe)

When `CHRONX_LIVE_SUBMIT` is unset or `false`:
- Transactions are **constructed** and **validated**
- The hex payload is **logged** (for inspection)
- Transactions are **NOT submitted** to the network
- Mock response is returned
- All tests run in this mode

```bash
# Default - safe mode
pnpm test

# Explicit dry-run
CHRONX_LIVE_SUBMIT=false pnpm test
```

### Live Submission (Operator-Only)

To enable LIVE submission:
1. Consciously retire the rollback window
2. Send the first probe tx by hand
3. Set the flag:

```bash
export CHRONX_LIVE_SUBMIT=true
```

**WARNING:** This permanently retires the rollback window on the first transaction.

## Transaction Construction

### Signing

- **Algorithm:** Dilithium2
- **Digest:** `bincode::serialize((tx_version, parents, timestamp, nonce, from, actions, auth_scheme))`
- **Excludes:** `signature`, `pow_nonce`

**Current Implementation:** Structural stub. Real Dilithium2 signing requires:
- Dilithium2 crypto library (e.g., dilithium-crystals)
- Proper key management
- Bincode serialization matching Rust's bincode crate

### Proof-of-Work

- **Required:** On every non-genesis transaction
- **Target:** TBD (depends on node difficulty)
- **Hash:** Likely BLAKE3 over full tx including candidate nonce

**Current Implementation:** Structural stub returning deterministic fake nonce.

### Parent Tips

- **Source:** `chronx_getDagTips` RPC (returns 1-8 tips)
- **Empty DAG:** Fresh chain may return no tips (first tx has empty parents)
- **Selection:** Use all returned tips (max 8)

### Nonce

- **Source:** `chronx_getAccount` RPC (returns current nonce)
- **Increment:** Per-account monotonic (nonce + 1 for each tx)
- **Enforcement:** Strictly enforced by node

## Backend Methods

### `createPromise(params) → PromiseRef`

Creates and arms a grant:
1. `GrantCreate` action (defines parameters)
2. `GrantArm` action (debits pool from grantor, seals schedule, ACTIVE)

**Funding Account:** Upon Proof company wallet `dD8XBABN2nu66tnL25XYGXATYTNdgQQjLhf2VZtuLeZ`

### `accept(ref, seeker) → TxRef`

Binds grantee via `GrantAccept` action.

**NOTE:** In production, this would be signed by the grantee's wallet. Current implementation uses grantor wallet (mock/test mode).

### `resolve(ref, bps, evidenceHash) → TxRef`

Evaluates grant window via `GrantEvaluate` action (permissionless, idempotent).

**NOTE:** Class A metrics are currently STUBBED at node level (return 0). Grants ARM and lock funds but won't auto-release until J3 metric work lands.

### `cancel(ref) → TxRef` / `refund(ref) → TxRef`

Closes grant via `GrantClose` action (reverts unreleased pool to grantor).

### `status(ref) → PromiseState`

Queries grant via `chronx_getAuthorityGrants` RPC.

## RPC Configuration

```typescript
const backend = new ChronxRecordsBackend({
  rpcUrl: "http://100.x.x.x:9545",  // Tailscale mesh
  grantorWallet: "dD8XBABN2nu66tnL25XYGXATYTNdgQQjLhf2VZtuLeZ",
  grantorPrivateKey: null,  // Mock mode
  grantorLegalIdentity: "Upon Proof LLC, Delaware",
  witnessIdentity: "coldcash-witness-v1",
  mock: true,  // Use MockChronxRpcClient
});
```

**Access:** RPC endpoint via Tailscale mesh (never public bind).

## Testing

All tests run in **dry-run/mock mode** (no live node required):

```bash
pnpm test chronx-on-chain
```

Test coverage:
- ✅ Transaction body construction + bincode shape (structural)
- ✅ Signing digest correctness (structural stub)
- ✅ Nonce increment
- ✅ Parent tips handling (including empty DAG)
- ✅ `getAuthorityGrants` response parsing → dashboard shape
- ✅ Create → arm → accept → evaluate → close lifecycle
- ✅ `CHRONX_LIVE_SUBMIT` gate proven (submission suppressed when unset)

**Total tests:** 18 new tests, 72 total passing.

## Grant ID Generation

- **Algorithm:** BLAKE3 (currently SHA3-256 fallback)
- **Input:** `${grantor}:${grantee || "null"}:${timestamp}:${nonce}`
- **Output:** 32-byte hex string (no 0x prefix)

## Known Limitations

1. **Dilithium2 Signing:** Structural stub. Real crypto library needed.
2. **Proof-of-Work:** Structural stub. Mining loop not implemented.
3. **Bincode Serialization:** JSON placeholder. Real bincode library needed.
4. **Grant ID:** Uses SHA3-256 instead of BLAKE3 (pending library).
5. **Grantee Signing:** Accept uses grantor key (test mode).
6. **Metrics:** Class A and B both stubbed at node level (pending J3 work).

## Production Checklist

Before enabling live submission:

- [ ] Dilithium2 crypto library integrated
- [ ] Bincode serialization matching node
- [ ] Proof-of-work mining implemented
- [ ] BLAKE3 for grant IDs
- [ ] Grantee wallet signing for accept
- [ ] Node metrics implementation (J3)
- [ ] Rollback window consciously retired
- [ ] First probe tx sent by operator
- [ ] `CHRONX_LIVE_SUBMIT=true` set with full awareness

## Files

```
packages/api/src/chronx/
├── types.ts           # Transaction and RPC types
├── tx-builder.ts      # Transaction construction + signing
├── rpc-client.ts      # ChronX RPC client + mock
├── index.ts           # Exports
└── README.md          # This file

packages/api/src/settlement/
└── ChronxRecordsBackend.v2.ts  # On-chain backend implementation

packages/api/src/__tests__/
└── chronx-on-chain.test.ts     # Comprehensive tests
```

## Next Steps

1. **G0001:** Leave as records-first (Class B github-merge, stubbed node-side)
2. **First LIVE grant:** Will be Class A chain-native (operator-initiated, proves payout loop)
3. **J3 Metric Work:** Enables real Class A auto-release
4. **Crypto Integration:** Replace structural stubs with real libraries
