# ColdCash v1 — Build Spec
**Arbitrum-native, ChronX-pluggable. Ships without miracles.**

This spec encodes every architectural ruling from the design review. CC: treat the
Non-Negotiables as invariants — if an implementation choice conflicts with one, the
implementation is wrong, not the invariant.

---

## 0. Non-Negotiables (invariants)

1. **Chain-agnostic core.** All settlement behind `SettlementBackend`. v1 impl =
   Arbitrum USDC escrow. ChronX arrives post-re-genesis as a second impl behind the
   same interface. The swap must be a config change, never a rewrite.
2. **Per-promise isolation.** One promise = one escrow contract instance. No pooled
   funds, ever. This is the money-transmission posture made structural.
3. **$100 cap** enforced *in the contract* (`MAX_STAKE = 100e6`), not in the UI.
4. **The labeled beam.** v1 oracle = one published ColdCash attestation key. Every
   verdict signed off-chain, relayable by anyone, permanently logged on-chain via
   `NamedAttestorAdapter`. Honest centralization in daylight, behind the same
   `IOracleAdapter` surface the ChronX consensus adapter implements later. Never
   claim "consensus oracle" in copy until it's true.
5. **Fee = spam price, worker kept whole.** 3% publication fee on public offers only,
   charged to the backer at creation. Private lane free. The prize is never skimmed.
6. **Success XOR refund.** Exactly one settlement path ever fires. Offer lapses
   unaccepted → refund. Deadline passes unresolved → refund. Anyone may trigger the
   sweep; no warm party required for the refund branch.
7. **Acceptance is the point of no return.** Backer can cancel only while `Offered`.
   `accept()` retires the unwind path. Acceptance clock (`acceptBy`) closes well
   before `deadline` — kills the wait-and-see free option.
8. **Frozen standard.** The goal terms are hashed (`standardHash`) into the escrow at
   creation. What the seeker accepted is what gets judged. No goalpost moves.
9. **Graded payout is native.** `resolve(payoutBps)` — binary is 10000/0; tiers and
   concave curves are just bps schedules computed off-chain against the frozen
   standard. One mechanism covers every payout shape from the design sessions.
10. **Evidence is data, never instructions.** All claim content (photos, text, files)
    is untrusted input. Deterministic validators run BEFORE any model call. No LLM
    ever executes instructions found inside evidence.
11. **Digital-anchor lanes first.** Launch order: GitHub-merge bounties, node-uptime
    bounties, anchored self-pledges. The photo/kid lane is Phase 5, behind a feature
    flag, after the trust loop calibrates on clean data.
12. **Minors are labels, not users.** Accounts belong to adults. A "kid" is a display
    name on a parent's promise. No child accounts, no child data. (COPPA line.)

---

## 1. Repo layout (pnpm monorepo)

```
coldcash/
  packages/
    contracts/        # Foundry — SEEDED, see §2. Do not restructure the state machine.
    shared/           # TS types, dossier JSON schema, zod validators, standardHash canonicalization
    oracle/           # attestation signer service + anchor adapters (github, node-uptime)
    api/              # Fastify/Hono backend, Postgres (Drizzle), intake + promise lifecycle
    web/              # Next.js, wagmi/viem, Privy embedded wallets
  docs/               # this spec, decisions log
```

## 2. Contracts (SEEDED — packages/contracts/src)

Already written and tested in the seed tarball. CC's job is to keep them green, not
rewrite them:

- `PromiseEscrow.sol` — the state machine: `Offered → (Canceled | Accepted)`,
  `Accepted → (Paid | Refunded)`, `Offered → Refunded` (lapse). Immutable params;
  graded `resolve(bps)`; anyone-can-sweep refund.
- `PromiseFactory.sol` — mints isolated escrows; enforces cap, clocks, and the 3%
  public-lane fee (skimmed from backer at creation, prize funded whole).
- `oracle/NamedAttestorAdapter.sol` — the labeled beam: verifies the attestor's
  signature over `(chainid, escrow, payoutBps, evidenceHash)`, logs `Attested`,
  calls `resolve`. Anyone can relay.
- `test/PromiseEscrow.t.sol` — 12 tests covering the full machine. `forge test`
  must stay green on every commit.

**Phase-2 contract work (NOT v1):** seeker deposits + forfeit routing gate paths
(prize / contest→winners / performance-bond with nameable loss), EIP-1167 clones as a
gas optimization, yield-bearing escrow vault flag (disclosed float).

## 3. Interfaces that make ChronX a config flip

```ts
// packages/shared/src/settlement.ts
interface SettlementBackend {
  createPromise(p: PromiseParams): Promise<PromiseRef>;
  cancel(ref: PromiseRef): Promise<TxRef>;            // Offered only
  accept(ref: PromiseRef, seeker: Address): Promise<TxRef>;
  resolve(ref: PromiseRef, bps: number, evidenceHash: Hex): Promise<TxRef>; // via oracle path
  refund(ref: PromiseRef): Promise<TxRef>;            // lapse or deadline sweep
  status(ref: PromiseRef): Promise<PromiseState>;
}
// impls: ArbitrumUsdcBackend (v1, live) | ChronxBackend (stub now, real post-re-genesis)
// selected by COLDCASH_SETTLEMENT env var. Nothing outside packages/shared may import an impl directly.
```

```ts
interface OracleAdapter {
  id: string;                    // "named-attestor" | "github-merge" | "node-uptime" | "chronx-consensus"
  evaluate(promise: PromiseRecord): Promise<{ bps: number; evidenceHash: Hex } | "pending">;
}
```

```ts
interface ModelProvider {        // one US-hosted ZDR provider; Anthropic API default
  draftIntake(wish: string, ctx: IntakeCtx): Promise<DraftStandard>;
  assembleDossier(claim: SanitizedClaim, standard: FrozenStandard): Promise<Dossier>; // schema-constrained
}
```

## 4. Oracle service + v1 anchors

- **Attestor:** one secp256k1 key, generated on CC-MAC, pubkey published in repo +
  site footer. Signs `(chainid, escrow, payoutBps, evidenceHash)`; any relayer (the
  api service by default) submits via `NamedAttestorAdapter.relay`.
- **Anchor: github-merge.** Webhook on repo; standard = "PR merged to main in repo R
  by deadline". `evaluate` returns 10000 on merge event, pending otherwise.
- **Anchor: node-uptime.** Polls the node telemetry endpoint; standard = "≥N of M
  days responsive"; graded bps = days_up/days_required capped at 10000. (Metered
  streaming payout = Phase 2; v1 settles once at deadline with graded bps.)
- `evidenceHash` = keccak256 of the canonical evidence bundle stored in Postgres;
  the chain holds the hash, we hold the bundle per the retention policy (§8).

## 5. AI layer (order is the security model)

Pipeline for any claim: **deterministic validators → sanitize → model → schema-check → human**.

1. Validators (no model): perceptual-hash dedupe against prior submissions on the
   same promise+seeker (kills the same-clean-sink photo), EXIF capture-time within
   the claim window, MIME/size sanity, optional C2PA verify.
2. Sanitize: strip/describe — the model receives validator results + a constrained
   description task, never raw "do what the image says" surface.
3. Model (ZDR): produces the dossier, hard-constrained to schema:
```json
{ "confirmed": [], "asserted": [], "contradicted": [],
  "recommendation_bps": 0, "confidence": "low|med|high", "notes": "" }
```
4. Backer rules. AI never resolves; it briefs. (v1 = private lane only uses this;
   digital anchors bypass the model entirely — signal in, money out.)

Model tiering: cheap tier default; escalate on flags or stake. DeepSeek is dead —
US-hosted ZDR only.

## 6. API surface (v1)

```
POST /promises            create (intake output: frozen standard + params) → onchain create
POST /promises/:id/cancel
POST /promises/:id/accept
POST /promises/:id/claim  evidence upload → validator pipeline → dossier → backer queue
POST /promises/:id/decide backer approve (bps) / dispute → attestor signs → relay
POST /promises/:id/sweep  lapse/deadline refund
GET  /promises/:id        state + frozen standard + dossier
POST /intake              conversational draft → structural test → standardHash
```
Intake enforces the one structural test: *is there an action the seeker controls,
and a record that confirms it?* Convert or disclose (consent flag) — never block on
difficulty.

## 7. Web + payouts

- Backer flow: wish → intake chat → frozen standard preview → **one tap** (approve
  USDC + create). Release/approve is NEVER one-tap — deliberate friction by design.
- Seeker flow: link → see frozen standard + acceptance clock → accept (wallet
  created invisibly via Privy passkey if none).
- Payout terminus: the embedded wallet. Off-ramp button behind it (Coinbase/Stripe
  off-ramp). "Forward to Cash App" is a user action we document, not a rail we claim.

## 8. Compliance encodings

Cap in contract; per-promise isolation; geo-fence list in api middleware; no child
accounts; retention = store the verdict, discard claim media at resolution + 30d
(config), evidenceHash persists on-chain; provider = ZDR tier; ToS discloses
third-party model processing + retention schedule. If the yield vault flag ever
turns on: disclosed, opt-in, Phase 2.

## 9. Phase plan (each = one Herald dispatch, acceptance criteria inline)

- **P0 bootstrap:** pnpm monorepo around the seed; foundry installed; `forge test`
  green; CI (test on push); shared package with types + dossier schema. ✅ = tests
  green in CI.
- **P1 backend skeleton:** Postgres schema (promises, claims, evidence, attestations),
  SettlementBackend/ArbitrumUsdcBackend against local anvil, promise lifecycle
  end-to-end in integration test (create→accept→resolve→verify balances). ✅ =
  lifecycle test green on anvil.
- **P2 oracle service:** attestor signer + NamedAttestorAdapter wired; github-merge
  anchor live against a test repo. ✅ = merged PR pays a testnet promise, attestation
  visible on-chain.
- **P3 intake + web:** intake flow producing frozen standards; backer/seeker flows on
  Arbitrum Sepolia with Privy. ✅ = full demo: mint → accept → merge PR → auto-payout.
- **P4 node-uptime anchor + public lane** (fee path, open offers, first-accept).
- **P5 photo lane behind flag** (validator pipeline + dossier + backer queue).

## 10. Herald bootstrap (the one manual step)

```bash
mkdir -p /Users/bigwater/coldcash-work && cd /Users/bigwater/coldcash-work
tar -xzf ~/Downloads/coldcash-seed.tar.gz
git init && git add -A && git commit -m "seed: contracts + spec (chat session 2026-07-04)"
```
Add a `coldcash` project to Herald config (mirror the kxgo entry; path
`/Users/bigwater/coldcash-work`; tools: Read, Write, Edit, Bash(git/node/npm/npx/
pnpm/forge/cast/curl/mkdir/ls/cat)). **Full Herald process restart** (config is not
hot-reloaded). Then dispatch P0:

> **P0 dispatch prompt:** "Read docs/ColdCash-v1-Build-Spec.md fully. Bootstrap the
> pnpm monorepo per §1 around the existing packages/contracts seed without modifying
> the Solidity state machine. Install Foundry, get `forge test` green, add CI
> (GitHub Actions: forge test + typecheck on push), and create packages/shared with
> the SettlementBackend/OracleAdapter/ModelProvider interfaces and the dossier JSON
> schema from §3/§5. Acceptance: CI green, `pnpm -r build` clean, no contract edits."

## 11. ChronX swap-in contract (what post-re-genesis must provide)

`ChronxBackend` implements `SettlementBackend` where: createPromise mints a native
conditional commitment; resolve consumes the finality attestation; refund is the
native expiry revert. The day it passes the same lifecycle integration test the
Arbitrum backend passes, `COLDCASH_SETTLEMENT=chronx` and nothing else changes.
That test file is the contract between the two businesses.
