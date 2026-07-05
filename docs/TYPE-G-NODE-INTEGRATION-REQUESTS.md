# ChronX Type_G Node Integration Requests — ColdCash Platform

**Parties:**
- **Consuming Platform:** ColdCash
- **Node Implementation:** ChronX Type_G (canonical v1)

**Date:** 2026-07-05

**Purpose:** Enumerate exactly what Type_G must expose at NODE level so ColdCash's testnet/backend integration is mechanical the day Type_G ships.

**Status:** PENDING — Awaiting implementer accept-or-amend on proposed signatures.

---

## Context

ColdCash has integrated Type_G semantics at the **records-first** layer (`coldcash-g0001` checkpoint, resolution proof, frontend rendering). This document specifies the node-level RPC surface required for ColdCash to migrate from static records to live on-chain grants.

**Critical dependency:** Section C (Records-First → Live Migration) determines whether `coldcash-g0001` records are permanent or throwaway. This is the **highest-priority answer needed.**

---

## A. Lifecycle RPC Methods

All proposed signatures follow existing `chronx_*` naming convention. Implementer may accept-or-amend like the change-requests document.

### A1. chronx_armGrant

**Purpose:** Submit Type_G ARMED payload to chain.

**ColdCash call-site:** `ChronxRecordsBackend.armGrant()` → `services/chronx/node-client.ts`

**Proposed signature:**
```typescript
chronx_armGrant(params: {
  grant_id: string,                    // platform-scoped unique identifier
  grantor_seat: string,                // base58 ChronX address
  grantee_seat: string | null,         // null for open acceptance, base58 for named
  identity_mode: {
    type: "direct" | "platform_of_record",
    platform_entity?: string,          // required if platform_of_record
    platform_signature?: string        // co-signature per change-request #2
  },
  pool_kx: number,                     // whole KX units per wallet convention
  window_schedule: {
    start_ts: number,                  // Unix timestamp
    end_ts: number,                    // Unix timestamp
    window_count: number,
    window_duration_sec: number
  },
  expiry_ts: number,                   // Unix timestamp
  revert_on_expiry: boolean,
  metric_spec: {
    class: "A" | "B",
    n_of_m?: { n: number, m: number, witness_seats: string[] }, // required if Class B
    metric_spec_mode: "plaintext" | "hash",
    metric_spec_hash?: string,         // required if hash mode (change-request #6)
    evidence_hash_required: boolean    // true for Class B per change-request #3
  },
  payout_curve: {
    type: "linear" | "stepped" | "threshold",
    parameters: Record<string, any>    // curve-specific params
  },
  squat_guard: {
    mode: "null_unbind" | "accept_bond",
    min_bond_kx?: number               // required if accept_bond (change-request #1c)
  } | null,
  grantee_bond?: {
    bond_kx: number,
    forfeit_routing: {
      success: "return_to_grantee",
      failure: "grantor" | "winners_pool" | "burn",
      failure_basis?: string,          // required if "grantor" (change-request #4)
      suspense: "return_to_grantee"    // unconditional per change-request #4 amendment
    }
  },
  accept_by_ts?: number,               // required if open acceptance (change-request #1)
  asset_ref?: string                   // reserved, defaults to KX (change-request #7)
}) => Promise<{
  grant_id: string,
  tx_hash: string,
  tx_index: number,
  armed_at_ts: number
}>
```

**Why:** This is the canonical grant authoring entry point. Every field maps 1:1 to the accepted change-requests. ColdCash UI collects these parameters; backend submits the bundle atomically.

**Amendment space:** Field naming, nesting structure, signature encoding format. Semantics are locked per change-requests.

---

### A2. chronx_acceptGrant

**Purpose:** Open-acceptance binding, first-in-committed-order.

**ColdCash call-site:** Grantee "Accept Grant" button → `ChronxRecordsBackend.acceptGrant()`

**Proposed signature:**
```typescript
chronx_acceptGrant(params: {
  grant_id: string,
  accepting_seat: string,              // base58 grantee address
  bond_kx?: number,                    // required if grant squat_guard.mode == "accept_bond"
  spec_signature?: string              // required if metric_spec_mode == "hash" (change-request #6)
}) => Promise<{
  grant_id: string,
  bound_seat: string,
  seat_index: number,                  // for multi-seat grants (change-request #5)
  tx_hash: string,
  accepted_at_ts: number
}>
```

**Why:** First-accept binding per change-request #1 amendments. `spec_signature` satisfies grantee sign-off requirement for hash mode. `bond_kx` posts optional grantee bond.

**ColdCash needs:** Error if `accept_by_ts` expired, or if all seats claimed (multi-seat), or if bond insufficient.

---

### A3. chronx_cancelGrant

**Purpose:** Cancel-until-accepted (change-request #1).

**ColdCash call-site:** Grantor "Cancel Grant" button (pre-acceptance only)

**Proposed signature:**
```typescript
chronx_cancelGrant(params: {
  grant_id: string,
  cancelling_seat: string              // must match grantor_seat
}) => Promise<{
  grant_id: string,
  tx_hash: string,
  cancelled_at_ts: number
}>
```

**Why:** Unwind option permanently retires on first accept. Must error if acceptance already committed.

**ColdCash needs:** Clear error code distinguishing "already accepted" from "not found" from "unauthorized seat."

---

### A4. chronx_submitAttestation

**Purpose:** Class B permissionless witness relay (change-request #3).

**ColdCash call-site:** Herald witness agent → `chronx-node-client` direct submission

**Proposed signature:**
```typescript
chronx_submitAttestation(params: {
  grant_id: string,
  window_index: number,                // 0-based
  metric_value: number,
  evidence_hash: string,               // keccak256 per change-request #3
  witness_seat: string,                // base58, must be in metric_spec.witness_seats
  witness_signature: string            // signature over {grant_id, window_index, metric_value, evidence_hash}
}) => Promise<{
  grant_id: string,
  window_index: number,
  attestation_hash: string,
  tx_hash: string,
  submitted_at_ts: number
}>
```

**Why:** Herald captures witness data (e.g., Strava activity, uploaded proof), computes evidence_hash parity with Arbitrum `NamedAttestorAdapter`, submits to chain. Permissionless = any relay can submit valid witness signatures.

**ColdCash needs:** Idempotency (duplicate submission returns existing attestation_hash, no error). Clear error if witness_seat not authorized for this grant.

---

### A5. chronx_evaluateGrant

**Purpose:** Idempotent poke → curve release or Null→revert.

**ColdCash call-site:** Scheduled evaluator cron OR user-triggered "Resolve Window" button

**Proposed signature:**
```typescript
chronx_evaluateGrant(params: {
  grant_id: string,
  window_index: number                 // 0-based
}) => Promise<{
  grant_id: string,
  window_index: number,
  evaluation_result: {
    threshold_met: boolean,
    attested_value?: number,           // null if threshold not met
    evidence_hash?: string,
    released_kx: number,               // may be 0 if threshold not met
    cumulative_released_kx: number
  },
  tx_hash: string,
  evaluated_at_ts: number
}>
```

**Why:** This is the deterministic state-transition that checks N-of-M witness consensus, applies payout curve, releases KX or marks Null. Idempotent = calling twice for same window returns same result, no double-release.

**ColdCash needs:** Callable AFTER window closes (error if too early). Returns deterministic result whether first eval or subsequent query.

---

### A6. chronx_getGrant — THE CRITICAL QUERY

**Purpose:** Full grant state for `/status` rendering. This is the call ColdCash hits on every page load.

**ColdCash call-site:** `app/routes/[grant_id]/status.tsx` → `ChronxRecordsBackend.getGrant()`

**Proposed signature:**
```typescript
chronx_getGrant(params: {
  grant_id: string
}) => Promise<{
  grant_id: string,
  status: "armed" | "accepted" | "active" | "completed" | "cancelled" | "reverted",
  armed_at_ts: number,
  grantor_seat: string,
  grantee_seats: Array<{
    seat: string,
    seat_index: number,
    accepted_at_ts: number,
    bond_kx?: number
  }>,
  pool_kx: number,
  window_schedule: {
    start_ts: number,
    end_ts: number,
    window_count: number,
    window_duration_sec: number
  },
  expiry_ts: number,
  windows: Array<{
    window_index: number,
    threshold_met: boolean,
    metric_value: number | null,
    evidence_hash: string | null,
    released_kx: number,
    evaluated: boolean,
    evaluated_at_ts?: number
  }>,
  cumulative_released_kx: number,
  remaining_pool_kx: number,
  resolution: {
    finalized: boolean,
    resolution_hash?: string,          // content-addressable seal
    settlement_tx_hash?: string
  },
  metric_spec: {
    class: "A" | "B",
    // ... rest of spec fields from A1
  },
  payout_curve: { /* ... */ },
  squat_guard: { /* ... */ } | null,
  grantee_bond?: { /* ... */ },
  asset_ref: string,
  
  // Optional extended data
  tx_refs: {
    armed_tx: string,
    accepted_tx?: string,
    evaluation_txs: string[],
    settlement_tx?: string
  }
}>
```

**Why:** This is ColdCash's render source-of-truth. The `/status` page displays:
- Grant terms (pool, schedule, curve)
- Bound seats (who accepted, when)
- Per-window progress (threshold met, metric value, KX released)
- Cumulative released KX vs. remaining pool
- Resolution seal (once finalized)

**ColdCash needs:** This response must be **fast** (sub-200ms) and **cacheable**. If this requires full-chain replay, provide a caching layer or indexed query path. This will be the highest-QPS endpoint ColdCash hits.

**Amendment space:** Field nesting, windowing pagination if `window_count` can be large (>100). Semantics locked.

---

### A7. chronx_getGrantsByGrantor

**Purpose:** List grants authored by a given grantor seat.

**ColdCash call-site:** User dashboard "My Grants (Grantor)" tab

**Proposed signature:**
```typescript
chronx_getGrantsByGrantor(params: {
  grantor_seat: string,
  status_filter?: Array<"armed" | "accepted" | "active" | "completed" | "cancelled" | "reverted">,
  offset?: number,
  limit?: number                       // default 50, max 200
}) => Promise<{
  grants: Array<{
    grant_id: string,
    status: string,
    armed_at_ts: number,
    grantee_seats: string[],
    pool_kx: number,
    cumulative_released_kx: number
  }>,
  total_count: number,
  has_more: boolean
}>
```

**Why:** Grantor needs to see all grants they've authored. Lightweight summary for list rendering.

---

### A8. chronx_getGrantsByGrantee

**Purpose:** List grants where a given seat is bound grantee.

**ColdCash call-site:** User dashboard "My Grants (Grantee)" tab

**Proposed signature:**
```typescript
chronx_getGrantsByGrantee(params: {
  grantee_seat: string,
  status_filter?: Array<"accepted" | "active" | "completed" | "reverted">,
  offset?: number,
  limit?: number
}) => Promise<{
  grants: Array<{
    grant_id: string,
    status: string,
    accepted_at_ts: number,
    grantor_seat: string,
    pool_kx: number,
    cumulative_released_kx: number,
    my_seat_index: number
  }>,
  total_count: number,
  has_more: boolean
}>
```

**Why:** Grantee needs to see all grants they've accepted. Same lightweight summary.

---

### A9. chronx_getOpenGrants

**Purpose:** Browse open-acceptance grants (not yet accepted, accept_by_ts not expired).

**ColdCash call-site:** Public browse page `/grants/open`

**Proposed signature:**
```typescript
chronx_getOpenGrants(params: {
  offset?: number,
  limit?: number,
  sort_by?: "armed_at_ts" | "expiry_ts" | "pool_kx"
}) => Promise<{
  grants: Array<{
    grant_id: string,
    grantor_seat: string,
    pool_kx: number,
    armed_at_ts: number,
    accept_by_ts: number,
    remaining_seats: number,           // for multi-seat grants
    squat_guard: { mode: string, min_bond_kx?: number } | null
  }>,
  total_count: number,
  has_more: boolean
}>
```

**Why:** Discovery mechanism. Users browse open lanes, click to view terms, accept if interested.

---

## B. Events / Subscription Mechanism

**ColdCash needs:** Real-time notification when grant state changes, without polling `chronx_getGrant` every N seconds.

**Proposed mechanism (accept-or-amend):**

### B1. chronx_subscribeGrantEvents

```typescript
chronx_subscribeGrantEvents(params: {
  grant_ids?: string[],                // specific grants, or omit for all
  event_types?: Array<"armed" | "accepted" | "window_evaluated" | "released" | "reverted" | "cancelled">,
  webhook_url?: string                 // HTTP POST target, or omit for WebSocket stream
}) => Promise<{
  subscription_id: string
}>
```

**Events emitted:**
```typescript
type GrantEvent = {
  event_type: "armed" | "accepted" | "window_evaluated" | "released" | "reverted" | "cancelled",
  grant_id: string,
  tx_hash: string,
  timestamp: number,
  data: {
    // event-specific payload, e.g.:
    // accepted: { bound_seat, seat_index }
    // window_evaluated: { window_index, threshold_met, released_kx }
  }
}
```

**Alternative if subscription not available:** Specify polling method + recommended cadence. ColdCash will implement client-side polling, but this increases latency and node load.

**Why:** ColdCash `/status` page needs to update live when Herald submits attestations or evaluator resolves windows. Events >> polling.

---

## C. Records-First → Live Migration — **HIGHEST PRIORITY**

### Background

`coldcash-g0001` exists TODAY as a committed checkpoint:
- **Records:** `coldcash-g0001-armed.jsonl`, resolution proof, settlement record
- **Frontend:** QR codes, `/status` rendering, all semantics working against static records
- **Commitment:** Content hash published, immutable

**The Question:**

When Type_G goes live at node level, can `coldcash-g0001` **REPLAY** into a live on-chain grant, preserving:
- Same `grant_id` ("g0001")
- Same armed terms (pool, schedule, curve, seats)
- Same resolution outcome (windows, released KX, evidence hashes)

...such that the records become the CHECKPOINT and the node grant becomes the CANONICAL LIVE STATE?

**OR:** Must ColdCash re-author g0001 from scratch, making this week's records a throwaway prototype?

---

### C1. Proposed Replay Mechanism

```typescript
chronx_replayGrant(params: {
  checkpoint_hash: string,             // content hash of signed checkpoint bundle
  checkpoint_payload: {
    // Full GrantArmed payload from checkpoint (same fields as chronx_armGrant)
    grant_id: string,
    grantor_seat: string,
    // ... all other fields
  },
  checkpoint_signatures: {
    grantor_signature: string,
    platform_signature?: string,       // if platform_of_record mode
    grantee_signature?: string         // if already accepted in checkpoint
  },
  replay_mode: "checkpoint_only" | "checkpoint_plus_live"
}) => Promise<{
  grant_id: string,
  replayed_from_checkpoint: string,
  live_grant_created: boolean,
  tx_hash?: string                     // if live grant created
}>
```

**Replay modes:**

1. **checkpoint_only:** Node records the checkpoint as immutable history, does NOT create live grant. Used for archival (grants already completed).

2. **checkpoint_plus_live:** Node records checkpoint AND creates live grant with same `grant_id`, allowing future windows to evaluate on-chain. Used when checkpoint is partial (some windows resolved, others pending).

**Why:** This determines whether g0001's records are permanent or disposable. If no replay path exists, ColdCash must:
- Discard g0001 records
- Re-author g0001 as a fresh grant (different grant_id or same with different tx history)
- Lose continuity between "records-first proving" and "live production"

**What ColdCash commits NOW to make replay work later:**

1. **Checkpoint content hash:** `keccak256(canonical_checkpoint_payload)` — committed to g0001 records
2. **Signatures:** Grantor + platform co-signature on checkpoint payload
3. **Payload structure:** Must match final `chronx_armGrant` schema (risk of mismatch if schema changes before node launch)

**The hand-off:**

- **Today:** ColdCash commits checkpoint hash + payload to records
- **Node launch day:** ColdCash calls `chronx_replayGrant(checkpoint_hash, payload, sigs, mode)`
- **Result:** g0001 goes live with preserved identity, no re-authoring

**Implementer must confirm:**

- [ ] Replay mechanism supported (or propose alternative continuity path)
- [ ] Checkpoint schema freeze (fields in checkpoint must match final `chronx_armGrant`)
- [ ] Hash algorithm (keccak256 acceptable, or specify alternative)
- [ ] Signature format (ED25519, secp256k1, other)

**THIS IS THE HIGHEST-PRIORITY ANSWER NEEDED.** Without a clear replay path, ColdCash's records-first work is architecturally orphaned.

---

## D. Wallet / Asset Hooks

### D1. KX Transfer Mechanics

**ColdCash needs clarity:**

When `chronx_evaluateGrant` releases KX to `grantee_seat`:
- Is this a **direct on-chain transfer** to the grantee's wallet (Upon Proof company wallet `dD8XBABN2nu66tnL25XYGXATYTNdgQQjLhf2VZtuLeZ`)?
- Or a **claimable balance** requiring grantee to call `chronx_claimRelease(grant_id, window_index)`?

**Preferred:** Direct transfer. Grantee wallet balance increases atomically on evaluation. No claim step.

**If claim required:** Specify `chronx_claimRelease` signature.

---

### D2. Amount Units

**Confirm:** All `pool_kx`, `released_kx`, `bond_kx` fields use **whole KX** units (not fractional, not smallest denomination).

**Why:** ColdCash wallet Send form, existing chronx_sendTransaction, and all UI display assumes whole KX. Consistency is critical.

---

### D3. Testnet Faucet

**ColdCash needs:**

```typescript
chronx_faucetFund(params: {
  recipient_seat: string,              // base58 address
  amount_kx: number
}) => Promise<{
  tx_hash: string,
  funded_amount_kx: number
}>
```

**Why:** Testnet grants require KX in grantor + grantee wallets. Public faucet or authenticated endpoint, either works. Must support repeated calls (multi-grant testing).

**Rate limit acceptable:** 1000 KX per seat per hour, or similar.

---

## E. Testnet Readiness Checklist

**Type_G is ready for ColdCash integration when ALL of the following are true:**

- [ ] **E1:** All lifecycle RPCs (A1-A9) implemented and responding with documented signatures
- [ ] **E2:** Events mechanism (B1) available, OR polling method specified with recommended cadence
- [ ] **E3:** Replay mechanism (C1) working, OR alternative continuity path confirmed
- [ ] **E4:** Seal reproduction test passing: `chronx_getGrant` response produces identical `resolution_hash` to independently computed seal from per-window data
- [ ] **E5:** Testnet devnet launched with documented RPC URL
- [ ] **E6:** Faucet endpoint (D3) available and funded
- [ ] **E7:** End-to-end sample grant documented: ARM → ACCEPT → EVALUATE (2+ windows) → finalized resolution, with example RPC calls + responses
- [ ] **E8:** Multi-seat grant test passing: open acceptance with 3+ seats, deterministic seat assignment per change-request #1 amendments
- [ ] **E9:** Class B attestation test passing: N-of-M witness signatures → threshold evaluation → release
- [ ] **E10:** Squat guard test passing: null_unbind and accept_bond modes both functional

**Acceptance criteria:** ColdCash backend runs `tests/chronx-node-integration.test.ts` against testnet RPC, all assertions pass.

---

## F. The One Go-Live Question

**When Type_G goes live at node level, ColdCash needs four answers to flip `ChronxRecordsBackend` from records-first-static to live-node with a config change:**

### F1. Which RPCs exist + final signatures?

**Need:** Confirmed list of available RPC methods from section A, with final signatures (accept-or-amend resolved).

**Blocker if missing:** ColdCash cannot implement node client.

---

### F2. Events vs. polling?

**Need:** Events subscription (B1) available, OR polling method + recommended cadence.

**Blocker if missing:** ColdCash `/status` page will be stale until manual refresh (poor UX).

---

### F3. Can `coldcash-g0001` checkpoint replay into live grant?

**Need:** YES/NO answer on replay mechanism (C1), plus exact schema freeze and signature format.

**Blocker if NO:** ColdCash's records-first work is orphaned; g0001 must be re-authored, losing continuity.

---

### F4. Testnet RPC URL + faucet?

**Need:** 
- Testnet RPC endpoint URL (e.g., `https://testnet-rpc.chronx.network`)
- Faucet endpoint or instructions to fund test wallets

**Blocker if missing:** ColdCash cannot begin integration testing.

---

## Go-Live Readiness Statement

**ColdCash is ready to integrate when:**

All four F-section answers are YES, and testnet checklist (section E) is complete. At that point, ColdCash can:

1. Implement `services/chronx/node-client.ts` against confirmed RPC signatures
2. Flip `ChronxRecordsBackend` to node-backed mode (config flag: `CHRONX_NODE_MODE=live`)
3. Replay `coldcash-g0001` checkpoint (if C1 confirmed)
4. Run full integration test suite against testnet
5. Migrate production `/status` rendering to live node queries

**Estimated integration time:** 3-5 days once all four answers confirmed (RPC client implementation + testing).

---

## Amendment Process

Like `TYPE-G-CHANGE-REQUESTS.md`, this document is a **formal coordination request**. Implementer may:

- **Accept as-is:** Proposed signatures become canonical
- **Amend:** Propose alternative signatures, nesting, naming (with rationale)
- **Reject with alternative:** If a request is infeasible, propose the alternative mechanism that achieves the same ColdCash requirement

**Contested proposals:** Escalate to SpecArena for formal disposition.

**ColdCash commitment:** Once signatures are accepted/amended, ColdCash implements against the confirmed spec. No further scope creep.

---

## Implementer Response Template

```markdown
## Response to ColdCash TYPE-G-NODE-INTEGRATION-REQUESTS

**Date:** [YYYY-MM-DD]

### A. Lifecycle RPCs
- [ ] A1-A9: ACCEPTED / AMENDED (specify changes) / REJECTED (with alternative)

### B. Events
- [ ] B1: ACCEPTED / POLLING ONLY (specify method) / ALTERNATIVE (describe)

### C. Replay Mechanism — CRITICAL
- [ ] C1: ACCEPTED / AMENDED / NOT SUPPORTED (must provide alternative continuity path)
- [ ] Checkpoint schema freeze confirmed: YES / NO (if NO, specify timeline)
- [ ] Hash algorithm: [algorithm]
- [ ] Signature format: [format]

### D. Wallet Hooks
- [ ] D1: Direct transfer / Claim required (if claim, provide signature)
- [ ] D2: Whole KX units confirmed: YES / NO
- [ ] D3: Faucet available: YES / ALTERNATIVE

### E. Testnet Checklist
- [ ] E1-E10 completion ETA: [date]

### F. Go-Live Answers
- [ ] F1: Confirmed RPC list: [list or PENDING]
- [ ] F2: Events / polling: [answer]
- [ ] F3: g0001 replay: YES / NO / PENDING
- [ ] F4: Testnet RPC URL: [URL or PENDING]

**Additional notes:** [implementer comments]
```

---

## Document Status

This document constitutes ColdCash's formal node integration request to ChronX Type_G implementer. Awaiting accept-or-amend disposition.

**Next action:** Implementer reviews, responds via template above, and confirms timeline for testnet readiness (section E).
