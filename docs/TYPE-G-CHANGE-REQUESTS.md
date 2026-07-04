# ChronX Type_G Change Requests — ColdCash Platform

**Parties:**
- **Requesting Platform:** ColdCash
- **Grant Type:** ChronX Type_G (canonical v1)

**Date:** 2026-07-04

**Status:** DISPOSED — All seven requests accepted, four with amendments; queued for SpecArena.

---

## 1. Open Acceptance Model

**ASK:**
Enable open acceptance via `GrantAccept`, requiring `accept_by_ts` strictly before first window close. Allow cancel-until-accepted, with acceptance permanently retiring the unwind option.

**DOCTRINE CHECK:**
Aligns with deterministic commitment and time-bounded execution. Requires consensus-order enforcement to prevent race conditions.

**DISPOSITION:**
**ACCEPTED** with three amendments:

(a) **First-accept definition:** First in consensus-committed order at window close, with deterministic tie-break by canonical linearization. Never first-seen time.

(b) **Accept-vs-cancel races:** Resolved by committed order in the canonical chain.

(c) **Squat defense required:** ColdCash refinement ACCEPTED for SpecArena consideration: `squat_guard` becomes an authored election with two modes:
- `null_unbind` — global auto-unbind evicts slow starters on long graded grants
- `accept_bond(min)` — mandatory bond adds friction the consumer lane may not want

The grantor spends this choice at authoring time like all other grant parameters.

**IMPLEMENTATION NOTE:**
ChronxBackend `accept()` maps to `GrantAccept`. ColdCash UI must display `accept_by` and `squat_guard` terms verbatim before user acceptance.

---

## 2. Platform-of-Record Grantor Identity

**ASK:**
Support `grantor_identity_mode` with two options:
- `direct` — grantor signs with their own key
- `platform_of_record{platform_entity}` — platform identity represents grantor

**DOCTRINE CHECK:**
Platform-as-identity requires liability assumption. Protocol must enforce accountability without becoming an underwriting authority.

**DISPOSITION:**
**ACCEPTED** with two amendments:

(a) **Platform co-signature required:** Platform must CO-SIGN each grant record, explicitly assuming liability. This assumption is the platform's own signed act, executed per-grant. Without valid co-signature, the mode is invalid.

(b) **No protocol-level pool threshold:** Underwriting credit lines are platform policy. The chain records only mode + signed identity; risk management is off-chain.

**IMPLEMENTATION NOTE:**
ColdCash entity key co-signs `GrantCreate` when operating in `platform_of_record` mode. ColdCash policy layer owns its own threshold and underwriting rules.

---

## 3. Evidence Hash in Class B Attestations

**ASK:**
Require `evidence_hash` in all Class B attestations. Witnesses must commit `keccak256(canonical_evidence_bundle)` alongside the signed value.

**DOCTRINE CHECK:**
Evidence commitment without on-chain storage. Retention becomes a witness-covenant duty.

**DISPOSITION:**
**ACCEPTED** as-is. Evidence retention is a witness-covenant duty, not chain law.

**IMPLEMENTATION NOTE:**
Maintain parity with Arbitrum `NamedAttestorAdapter` digest implementation. Both rails must produce identical evidence commitments.

---

## 4. Optional Grantee Bond with Pre-Committed Forfeit Routing

**ASK:**
Enable optional `grantee_bond_kx` posted at acceptance, with pre-committed forfeit routing:
- **Success:** Bond returns to grantee + release
- **Failure forfeit destinations (enumerated only):**
  - Grantor IFF Class A metric AND declared liquidated-damages basis in record (two-condition rule: no party profits from a failure it can influence or that compensates no nameable loss)
  - Winners' pool in multi-seat grants
  - Burn/neutral

Invariants:
- I3: Enumerated-at-authoring destination set
- I4: Auditor never receives bond proceeds under any circumstance

**DOCTRINE CHECK:**
Bond forfeit must not create perverse incentives. Liquidated damages doctrine requires pre-stated basis. Suspense scenarios need explicit handling.

**DISPOSITION:**
**ACCEPTED** with one critical amendment:

**Suspense DEFAULT-RETURN:** On suspense (procedural death, not performance failure), bonds return to grantees UNCONDITIONALLY. Failure routing was authored for performance failure only. This amendment closes the suspense-bond-harvesting attack (grantor-friendly auditor flags grant, stalls past deadline, then harvests bonds).

**Attorney note preserved:** The declared liquidated-damages basis is what prevents grantor-forfeit from being an unenforceable penalty clause under contract law. Keep the two-condition rule verbatim.

**IMPLEMENTATION NOTE:**
ColdCash intake UI must render bond terms and forfeit routing as separate, explicit line items before user acceptance. Make clear that bonds are for performance failure only.

---

## 5. Multi-Seat Grants

**ASK:**
Support `grantee_seats[max_n]` against a single pool:
- Each `GrantAccept` claims one seat
- Per-seat independent evaluation against the sealed `metric_spec`
- Per-seat caps sum ≤ pool (folds into I1 pool conservation)

**DOCTRINE CHECK:**
Requires deterministic seat assignment. Depends on Ask #1 acceptance model amendments.

**DISPOSITION:**
**ACCEPTED**; depends on Ask #1 amendments for seat assignment order.

**IMPLEMENTATION NOTE:**
The "first 5 node operators" open lane use case maps 1:1 to this model. ColdCash browse UI must show seats remaining dynamically.

---

## 6. Metric Spec Hash Mode (Class B)

**ASK:**
Enable `metric_spec_hash` mode for Class B grants. Spec committed as hash; trust model (N-of-M, seat identities) remains printed on-chain.

**DOCTRINE CHECK:**
Hash commitment without plaintext disclosure. Requires enforceable proof-of-receipt to bind parties.

**DISPOSITION:**
**ACCEPTED** with one amendment:

**Grantee signature required:** Grantee (and auditor, if seated) must receive and SIGN the plaintext spec at acceptance. The hash commits what parties provably hold. Nobody is bound to terms they cannot prove they received. This preserves the court-order compulsion path — there must be something to compel.

**IMPLEMENTATION NOTE:**
- ColdCash intake delivers plaintext spec to accepting grantee
- Acceptance signature covers the `spec_hash`
- ColdCash retains the signed plaintext per its document retention policy

---

## 7. Asset Reference Field (Reserved)

**ASK:**
Add reserved `asset_ref` field with default behavior limited to KX tokens. Non-KX assets gated behind the canonical Bound Anchor construction (when available).

**DOCTRINE CHECK:**
Future-proofing for multi-asset support without breaking current KX-only invariants.

**DISPOSITION:**
**ACCEPTED** trivially. No immediate impact; reserves namespace.

**IMPLEMENTATION NOTE:**
ChronxBackend treats `asset_ref` as KX-only until Bound Anchor construction lands. No code changes required now.

---

## Deliberate Non-Asks (Accepted Refusals)

The following were explicitly considered and **rejected** by mutual agreement, recorded here as accepted refusals:

1. **No price-peg oracle in the type:** Volatility insulation is platform-layer responsibility. Price feeds are gameable external I/O that Type_G invariants explicitly forbid.

2. **No protocol-level dispute/override machinery:** Rationed overrides, dossiers, human verdicts live at ColdCash platform layer. The chain maintains zero-discretion purity. Court-order certificate remains the only legal entry point.

3. **No renegotiation-after-accept:** Frozen standard is load-bearing on both legal and technical rails. Once accepted, grant terms are immutable.

---

## Document Status

This file constitutes the formal record of change requests between ColdCash (requesting platform) and ChronX Type_G (canonical grant type specification), dispositioned on 2026-07-04. All seven requests accepted with noted amendments. Implementation proceeds per noted dependencies and queuing for SpecArena ratification.
