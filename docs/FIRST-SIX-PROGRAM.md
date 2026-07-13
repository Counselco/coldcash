# First Six Program — Upon Proof Node Operator Payment Rail

**Program Name:** First Six  
**Operator:** Upon Proof (uponproof.com)  
**Grantor:** Upon Proof company wallet `dD8XBABN2nu66tnL25XYGXATYTNdgQQjLhf2VZtuLeZ`  
**Date:** 2026-07-10  
**Status:** Program law — canonical reference for implementation

---

## Executive Summary

The First Six Program is Upon Proof's flagship payment rail for ChronX node operators. It pays the first 6 qualifying node operators up to $10/month for 12 months each, subject to monthly uptime requirements. Total program cap: $720 ($120 per operator × 6 seats).

This document is the **complete program law** — the canonical specification for all technical implementation, UI rendering, and operational decisions.

**CHANGELOG (2026-07-13):** Per-operator payment terms updated from $20/month × 5 months to $10/month × 12 months. This supersedes the prior $20×5 ruling. Per-seat cap increases from $100 to $120, program cap from $600 to $720. Payout curve and floor behavior unchanged (linear from 80% floor).

---

## PROGRAM

**Eligibility:** ChronX node operators running real, reachable nodes serving RPC traffic.

**Compensation:**
- **Per-seat cap:** Up to $10/month for 12 months = $120/operator maximum
- **Program cap:** 6 seats × $120 = $720 total maximum payout across all operators

**Grantor:** Upon Proof company wallet `dD8XBABN2nu66tnL25XYGXATYTNdgQQjLhf2VZtuLeZ` escrows and disburses all payments.

**Payment Vehicle:** ChronX Type_G grants (one grant per seat, lazy-armed at claim-time).

**Lifecycle:**
1. Seat opens (automatic, 30-day cadence per section below)
2. Operator claims seat (first-come-first-served, DAG commit order)
3. Grant arms for that operator only (escrow snaps shut per-seat)
4. Monthly uptime measured, KX released on linear curve
5. After 12 months OR voluntary exit, grant closes and seat is freed

---

## SEAT CADENCE

**Joseph's ruling (verbatim program law):**

Seat 1 opens at program launch. Each subsequent seat (2-6) opens automatically 30 days after the prior seat opened.

**The valve:** The rail operator (Joseph) may cancel any not-yet-claimed opening at any time. Cancellation applies ONLY to unopened seats — nothing armed is ever touched. This is the program's throttle valve.

**Seat lifecycle timeline:**
- **Day 0:** Seat 1 opens (program launch)
- **Day 30:** Seat 2 opens (if not cancelled)
- **Day 60:** Seat 3 opens (if not cancelled)
- **Day 90:** Seat 4 opens (if not cancelled)
- **Day 120:** Seat 5 opens (if not cancelled)
- **Day 150:** Seat 6 opens (if not cancelled)

**Recycled seats:** A node operator may voluntarily exit at any time. When an operator exits:
1. Earning stops immediately
2. `GrantClose` returns unearned remainder to treasury
3. Freed budget re-enters the drip as a new opening on the next 30-day tick

Example: If Seat 3 operator exits on Day 75, and no other seat has freed, a new seat opens on Day 180 (the next 30-day tick after Day 150). Recycled seats extend the cadence but preserve 30-day spacing.

**First-come-first-served:** Claiming is resolved by DAG commit order of claim transactions. This is consensus-ordered fairness with no site discretion.

---

## ENROLLMENT

### Claim Mechanics

**Claim transaction:** An operator's claim is their seat's first transaction, bearing:
1. **Proof-of-work:** Small computational proof (sybil cost)
2. **Refundable bond:** Small KX bond (e.g., 10 KX) — returned if claim succeeds OR if claim fails due to seat already taken

**Losing claimants:** If multiple operators claim the same seat, DAG commit order determines the winner. All losing claimants' bonds return automatically.

**Checks on claim:**
- Seat is open (not yet claimed, not cancelled)
- Claim transaction is valid (PoW correct, bond sufficient)
- Operator's ChronX address is reachable and serving RPC

### Anti-Fraud Baked Into Standard

The eligibility standard is frozen into the program specification:

> "A real, reachable node serving RPC traffic. A mock endpoint, proxy forwarding to someone else's node, or unreachable address does NOT satisfy the standard."

This is not a flexible guideline — it is the immutable requirement. Attestor refusal to certify uptime for a non-compliant node is **enforcement of the standard**, not discretionary adjustment.

### Grant Arming (Lazy-ARM)

Grants arm **per-seat at claim-time**, not in advance. When a claim succeeds:
1. Escrow for that seat (up to $120 in KX) snaps shut from the program treasury
2. Grant transitions to ARMED state for that operator's address
3. First payment window opens immediately

**No pooled escrow:** Each seat's grant is independent. Seat 1's escrow does not fund Seat 2. If the program treasury runs low, unclaimed seats simply cannot arm (fail-safe, not fail-pooled).

---

## METRIC & PAYOUT

### Monthly Uptime Metric

**Metric:** Monthly uptime percentage, measured per calendar month (00:00 UTC first day → 23:59 UTC last day).

**Sensor v1 (probe-based attested uptime):**
- **How it works:** Attestor pings the operator's node on a regular schedule (e.g., every 15 minutes) to check health and RPC responsiveness
- **Uptime calculation:** `(successful_pings / total_pings) × 100`
- **Labeling:** Openly labeled as "attested uptime" in all UI displays

**Critical transparency:** This is NOT node-native uptime from ChronX consensus records. It is an external probe-based measurement. The distinction is disclosed to operators before they claim.

**Future sensor swap (OracleAdapter seam):**

When the J3 metric+records work lands, the sensor will swap to node-native consecutive window retention / participation queries. The **display remains the same** (monthly uptime percentage), but the **data source changes** from probe-based to consensus-native.

The `OracleAdapter` seam is documented to make this swap seamless — no operator-visible change, no retroactive adjustment to existing grants.

### Payout Curve

**Type:** Linear on monthly uptime percentage.

**Formula:**
```
payout_usd = min(10.00, (uptime_pct / 100) × 10.00)
```

**Floor behavior:**
- **Below floor (uptime < 80%):** $0 payout for that month
- **Unearned funds:** Revert to treasury (NOT rolled over to subsequent months)
- **Rationale:** Operators must maintain >80% uptime to earn. Sporadic participation does not accumulate credit.

**Cap enforcement:** No single month can pay more than $10 USD-equivalent. No operator can earn more than $120 total across 12 months.

**Example payouts (assuming 80% floor):**
- 100% uptime → $10
- 90% uptime → $9
- 85% uptime → $8.50
- 79% uptime → $0 (below floor, full reversion)

---

## DENOMINATION

### USD-Denominated, KX-Settled

**Display currency:** All amounts shown to users in USD ($10/month, $120 cap).

**Settlement currency:** Payments settle in KX at the settlement-time rate.

**Rate source:** XChan KX→USDC oracle (via XChan API, see XCHAN-API-REQUIREMENTS.md v0.2).

**Provenance gate:** KX settlement is **gated behind XChan price provenance**:
- **Flag:** `COLDCASH_TRUST_XCHAN_PRICE` (default: OFF)
- **Requirement:** `reserve_depth_usdc` and real oracle rate must be available from XChan before conversion

**Before provenance ships:**
- Display KX amounts in UI with honest 'rate pending provenance' labeling
- Do NOT execute swaps or claim they are "locked in" at any specific rate
- Operators are informed that USD → KX conversion awaits provenance guarantees

**After provenance ships:**
- Joseph consciously flips `COLDCASH_TRUST_XCHAN_PRICE=true`
- Settlement pipeline executes: monthly window closes → uptime measured → payout calculated in USD → XChan quote → swap KX → disburse to operator

---

## CHAIN READS

**Site = stateless viewer principle:** Upon Proof's frontend is a read-only view over ChronX chain state. No local fixtures, no database of record for grant state.

### Required Chain Queries

**1. Vault Proof-of-Funds:**
- `getAuthorityGrants(grantor_seat)` — list all grants from Upon Proof wallet
- `getLocks(grantor_seat)` — verify escrowed amounts for armed grants

**2. Seats Open/Claimed:**
- Count of open seats (max 6, decrements on claim)
- Count of claimed seats (increments on successful claim, decrements on exit)
- Display: "Seat X of 6 available" or "All seats claimed"

**3. Per-Operator Live Curve Tracking:**
- `getGrant(grant_id)` for each operator's grant
- Live display: current month uptime %, projected payout, cumulative earned

**4. Permanent Per-Window Receipts:**
- Each monthly window stores: uptime %, KX released, evidence hash, TxId
- Operator dashboard shows all 12 months' receipts (immutable audit trail)

**5. Reversion Transparency:**
- If a month pays $0 due to floor miss, display: "Window 3: 0 KX released (uptime 72%, below 80% floor)"
- Show unearned amount reverted to treasury

**6. Valve State Banner:**
- If Joseph cancels a future opening: "Enrollment paused pending review. Seat X will not open as scheduled."
- Display on homepage, operator dashboard, claim page

### No Local State

The following are **prohibited in Upon Proof backend**:
- Hardcoded grant fixtures (no `first-six-g0001.json`)
- Database table storing "expected seats" or "planned openings"
- Any local calculation of "who should have won" a seat claim

**Why:** Chain state is source-of-truth. If it's not on-chain, it didn't happen.

---

## SAFETY SEQUENCE

**Non-negotiable sequence for live launch:**

### Step 1: Default-OFF Gate

All live ChronX transaction submission is behind `CHRONX_LIVE_SUBMIT` flag (default: OFF). Code ships with flag off. Joseph must consciously flip it.

### Step 2: Rollback Window Retirement (Banked)

Joseph manually verifies:
- Testnet end-to-end test passed (claim → arm → attest → evaluate → disburse)
- Grantor wallet funded with program cap + buffer
- XChan provenance confirmed (or decision to launch without, with operator disclosure)

Joseph commits: "Rollback window retired. Proceeding to live launch."

### Step 3: Hand-Fire First Probe

Joseph manually submits the first probe transaction (e.g., Seat 1 opening, or a test claim from a known operator address). This is the conscious trigger — not automated, not background-cron.

**Probe confirms:**
- Transaction reaches chain
- RPC responds correctly
- Grant state updates as expected

### Step 4: Flag Flip

If probe succeeds, Joseph flips `CHRONX_LIVE_SUBMIT=true` in production config.

### Step 5: Program Launch

Program opens Seat 1. Public announcement: "First Six Program is live. Claim your seat at uponproof.com/first-six."

**No automated launch.** No "deploy = live." Joseph's hand is on every trigger until the program proves itself.

---

## ARCHITECTURE RULING

**Writes through chronx-wallet, reads through RPC.**

This is the settled architecture from prior work:
- **Write path:** `chronx-wallet` library for transaction signing and submission
- **Read path:** `chronx-rpc-client` querying node endpoints

**Why this split:**
- Wallet lib holds keys, signs locally (custody boundary)
- RPC client is stateless, cacheable, horizontally scalable
- No local chainstate replication in Upon Proof backend

**Codebases:**
- Wallet: `packages/chronx-wallet/`
- RPC client: `services/chronx/node-client.ts` (when Type_G node integration ships)

---

## ROADMAP (Explicitly Out of Scope for v1)

The following are **chapters 2-4** of the First Six Program and upon-proof.com payment rail evolution. They are documented here for transparency, but are **NOT in scope for initial launch**.

### Chapter 2: The Relic Compiler

**Vision:** Compiled message+money+trigger instruments on the 100-year horizon.

A grant becomes a programmable financial object: "Pay my grandchildren $X/year for education, triggered by enrollment proof, for 18 years starting in 2045."

**Not in v1:** First Six uses manual grant authoring (Joseph creates each grant via UI). Relic Compiler is deferred until Type_G semantics are battle-tested in production.

### Chapter 3: Advance-on-Armed-Grant Factoring

**Vision:** Loans against escrowed receivables.

An operator with 3 months of uptime history can borrow against their remaining 2 months of expected payout. A factoring entity buys the receivable at a discount, operator gets liquidity now.

**Not in v1:** No factoring market, no secondary trading of grants. Operators receive KX on the monthly schedule only.

### Chapter 4: Walletless Claims

**Vision:** Lower barriers to participation.

- **Email claim-links:** "You've been granted Seat 4. Click to claim, we'll create a wallet for you."
- **Name-only claims via evidence event:** "Provide your Strava handle, we'll escrow until you set up a wallet."
- **Grandma Mode custodial seats:** Operator earns, Upon Proof holds custody, disburses to PayPal on request.
- **Fiat adapter integration:** Claim settlement directly to PayPal USD, no operator-visible KX step.

**Not in v1:** All operators must have a ChronX wallet and claim via on-chain transaction. Custodial/walletless flows are deferred until the base rail proves reliable.

---

## Deliberate Non-Asks (Accepted Constraints)

The following were explicitly considered and **rejected** for v1:

1. **No multi-chain support:** KX on ChronX only. No Ethereum, no Arbitrum, no Solana USDC direct. XChan bridges to Base for fiat offramp; that's the limit.

2. **No dynamic seat caps:** 6 seats is hard-coded. No "add more seats if demand is high." Scarcity is load-bearing for program integrity.

3. **No retroactive uptime credit:** If an operator misses the floor one month, that month's budget is gone. No "average across 5 months" makeup.

4. **No manual override of attestations:** If the probe says 72% uptime, that's the record. No Joseph-override to "give them credit anyway." Court-order certificate remains the only legal entry point for post-hoc adjustment.

5. **No automated seat recycling within the month:** If an operator exits on Day 10 of a 30-day window, the next seat opens on the next 30-day tick, not immediately. This prevents gaming (claim, exit, re-claim under new address).

---

## Document Status

This document constitutes the complete program law for the First Six Program. All technical implementation, UI rendering, operator disclosures, and operational decisions must conform to this specification.

**Next actions:**
1. Implement seat cadence logic (30-day opens, cancellation valve, recycled seat tracking)
2. Implement claim transaction PoW + bond mechanics
3. Implement probe-based attestation pipeline (sensor v1)
4. Implement linear payout curve with floor enforcement
5. Implement XChan integration for USD→KX settlement (gated behind provenance)
6. Implement stateless chain-read UI (no local fixtures)
7. Execute safety sequence (Steps 1-5) before live launch

**Change control:** Amendments to this program law require Joseph's explicit written approval and a new dated version of this document. No silent edits.

---

**Program operator:** Joseph R. Sanchez (josephrsanchez@gmail.com)  
**Canonical reference:** docs/FIRST-SIX-PROGRAM.md  
**Version:** 1.0 (2026-07-10)
