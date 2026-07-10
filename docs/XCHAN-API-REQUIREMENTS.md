# XChan API Requirements v0.1

**Date:** 2026-07-04  
**Status:** Requirements specification for XChan operator  
**Contact:** ColdCash integration team

---

## Executive Summary

ColdCash requires programmatic endpoints from XChan to display live KX→USDC conversion quotes and track deposit status in the payout flow. This document specifies the required API surface.

## Custody Model

**Critical:** ColdCash never touches user funds in the KX→USDC flow. Users send KX directly from their ChronX wallets to XChan's bridge address. ColdCash only:
- Fetches and displays quotes
- Links to XChan
- Displays deposit status (when available)

All custody, conversion, and USDC disbursement is XChan's responsibility.

## Required Endpoints

### 1. GET /api/quote

**Purpose:** Fetch current KX→USDC conversion rate and pool depth.

**Request:**
```
GET /api/quote?kx=<amount>
```

**Query Parameters:**
- `kx` (required): Amount of KX to quote, as decimal number

**Response:**
```json
{
  "usdc_estimate": 125.50,
  "rate": 0.003185,
  "reserve_depth_usdc": 15000.00,
  "as_of": 1720134520000
}
```

**Fields:**
- `usdc_estimate` (number): Estimated USDC output for the quoted KX amount
- `rate` (number): Current price of 1 KX in USDC
- `reserve_depth_usdc` (number): **REQUIRED** — Available USDC liquidity in the pool
- `as_of` (integer): Unix timestamp (milliseconds) when the quote was generated

**Why reserve_depth_usdc is required:**

Recipients deciding whether to work for a KX-denominated promise deserve transparency about the exit liquidity. A quote without pool depth is an incomplete signal — a $1000 payout looks different when backed by $500 vs $50,000 in reserves.

Displaying pool depth:
1. Sets honest expectations (shallow pools may require waiting for liquidity)
2. Prevents recipient frustration from discovering illiquidity only after work is complete
3. Aligns with ColdCash's transparency principles

**Rate staleness expectations:**

- Quotes older than 60 seconds should trigger a UI warning
- Quotes older than 5 minutes should be considered stale and not displayed
- ColdCash will poll this endpoint at most once per 30 seconds per active user session

### 2. POST /api/register

**Purpose:** Register a ChronX address and Base USDC destination for automatic conversion.

**Request:**
```
POST /api/register
Content-Type: application/json

{
  "chronx_address": "FGSemyJdkCU85D4qQNWFd158J44MANAHTAF5Qx974WRR",
  "base_usdc_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
}
```

**Fields:**
- `chronx_address` (string): ChronX wallet address (Solana format) that will send KX
- `base_usdc_address` (string): Base network address (0x-prefixed) to receive USDC

**Response (success):**
```json
{
  "ref": "reg_abc123xyz",
  "bridge_address": "FGSemyJdkCU85D4qQNWFd158J44MANAHTAF5Qx974WRR",
  "status": "registered"
}
```

**Response (error):**
```json
{
  "error": "invalid_address",
  "message": "Base address must be a valid 0x-prefixed Ethereum address"
}
```

**Error codes:**
- `invalid_address`: Malformed address
- `rate_limit`: Too many registration attempts
- `service_unavailable`: XChan bridge temporarily offline

### 3. GET /api/deposit/<ref>

**Purpose:** Check the status of a KX deposit and conversion.

**Request:**
```
GET /api/deposit/<ref>
```

**Path Parameters:**
- `ref` (required): Registration reference from POST /api/register, OR Base address

**Alternative form:**
```
GET /api/deposit?base=<base_address>
```

**Response (deposit found):**
```json
{
  "status": "swapped",
  "kx_received": 39450.0,
  "usdc_sent": 125.50,
  "tx_refs": {
    "kx_deposit": "solana_tx_hash",
    "usdc_send": "base_tx_hash"
  },
  "updated_at": 1720134580000
}
```

**Response (no deposit yet):**
```json
{
  "status": "watching",
  "updated_at": 1720134520000
}
```

**Status values:**
- `watching`: Registration active, awaiting KX deposit
- `received`: KX deposit confirmed on ChronX
- `swapped`: KX converted to USDC in pool
- `sent`: USDC sent to Base address (final state)

**Fields:**
- `status` (string): Current deposit state
- `kx_received` (number, optional): KX amount received
- `usdc_sent` (number, optional): USDC amount sent to Base address
- `tx_refs` (object, optional): Transaction hashes for deposit and disbursement
- `updated_at` (integer): Unix timestamp (milliseconds) of last status change

### 4. Webhook (optional)

**Purpose:** Notify ColdCash backend when deposit status changes (optional enhancement).

**Not required for v0.1** — ColdCash will poll GET /api/deposit. If XChan implements webhooks in future versions, ColdCash can subscribe.

**Proposed format (future):**
```
POST <coldcash_webhook_url>
Content-Type: application/json

{
  "ref": "reg_abc123xyz",
  "status": "sent",
  "kx_received": 39450.0,
  "usdc_sent": 125.50,
  "tx_refs": { ... }
}
```

---

## Rate Limiting

ColdCash will:
- Poll GET /api/quote at most once per 30 seconds per user session
- Cache quotes client-side for 30 seconds
- Throttle registration attempts to 1 per wallet per 60 seconds

We request XChan rate limits of:
- **GET /api/quote**: 120 requests/minute per IP
- **POST /api/register**: 10 requests/minute per IP
- **GET /api/deposit**: 60 requests/minute per IP

## Error Handling

ColdCash will gracefully degrade when:
- **Quote unavailable**: Hide quote display, show "Visit XChan for current rates" link only
- **Registration fails**: Display error message, allow retry after 60 seconds
- **Status check fails**: Show "Status unavailable" instead of polling state

## Security

- All endpoints must use HTTPS
- POST /api/register must validate address formats (prevent injection)
- No authentication required for v0.1 (public quote service)

## Timeline

- **v0.1 (this spec)**: GET /api/quote, POST /api/register, GET /api/deposit
- **v0.2 (future)**: Webhook support, authenticated API for higher rate limits
- **v0.3 (future)**: Batch quote endpoint, historical rate data

---

## Contact

For questions or clarifications on this spec:
- Email: josephrsanchez@gmail.com
- Project: github.com/josephrsanchez/coldcash-work (private)

## Changelog

- **2026-07-04**: v0.1 initial requirements
- **2026-07-10**: v0.2 programmatic swap execution, settlement confirmation, idempotency

---

# XChan API Requirements v0.2

**Date:** 2026-07-10  
**Status:** Requirements specification — programmatic swap execution and settlement tracking  
**Contact:** ColdCash/Upon Proof integration team

---

## Executive Summary

v0.2 extends v0.1 with programmatic swap execution capabilities required for automated settlement flows. ColdCash/Upon Proof backend needs to execute KX→USDC swaps on behalf of grant recipients and track settlement completion to trigger downstream payment legs (e.g., USDC→PayPal).

**Critical:** This request does NOT ask XChan to integrate fiat rails (PayPal, bank transfers, etc.). Fiat integration lives in Upon Proof's pluggable fiat adapter, keeping XChan a pure KX↔USDC bridge.

---

## Required Endpoints (v0.2)

### 1. POST /api/swap/execute

**Purpose:** Execute a programmatic KX→USDC swap and deliver USDC to a designated Base address.

**Request:**
```
POST /api/swap/execute
Content-Type: application/json

{
  "chronx_address": "FGSemyJdkCU85D4qQNWFd158J44MANAHTAF5Qx974WRR",
  "kx_amount": 39450.0,
  "base_usdc_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "idempotency_key": "coldcash-g0003:w2",
  "memo": "g0003 window 2 payout"
}
```

**Fields:**
- `chronx_address` (string, required): ChronX wallet address sending KX
- `kx_amount` (number, required): Amount of KX to swap (whole units)
- `base_usdc_address` (string, required): Base network address to receive USDC (0x-prefixed)
- `idempotency_key` (string, required): Unique key for this swap (e.g., `coldcash-g000X:wN` tying swap to grant window)
- `memo` (string, optional): Human-readable memo for tracking (max 256 chars)

**Response (success):**
```json
{
  "swap_id": "swap_abc123xyz",
  "status": "pending",
  "kx_amount": 39450.0,
  "usdc_estimate": 125.50,
  "rate": 0.003185,
  "idempotency_key": "coldcash-g0003:w2",
  "created_at": 1720134520000
}
```

**Response (duplicate idempotency_key):**
```json
{
  "swap_id": "swap_abc123xyz",
  "status": "completed",
  "message": "Swap already executed with this idempotency key",
  "original_request": { ... },
  "created_at": 1720134520000
}
```

**Error responses:**
```json
{
  "error": "insufficient_liquidity",
  "message": "Pool depth (500 USDC) insufficient for swap estimate (1250 USDC)"
}
```

**Error codes:**
- `insufficient_liquidity`: Pool cannot fulfill swap at current depth
- `invalid_address`: Malformed ChronX or Base address
- `rate_limit`: Too many swap requests
- `service_unavailable`: XChan bridge temporarily offline

**Idempotency guarantee:**

Duplicate requests with the same `idempotency_key` must:
1. Return the original swap's `swap_id` and status
2. NOT execute a second swap
3. NOT charge/deduct twice

Idempotency keys are scoped to the requesting entity (ColdCash/Upon Proof). Keys from different platforms do not collide.

**Why idempotency is critical:**

Network failures, retries, and duplicate submissions are inevitable in automated settlement flows. Without idempotency, a retry could double-pay a recipient or drain liquidity. The key ties each swap to its grant window (e.g., `coldcash-g0003:w2` = grant g0003, window 2), ensuring exactly-once settlement semantics.

---

### 2. GET /api/swap/:swap_id

**Purpose:** Check status of a swap and retrieve settlement confirmation.

**Request:**
```
GET /api/swap/swap_abc123xyz
```

**Path Parameters:**
- `swap_id` (required): Swap reference from POST /api/swap/execute

**Alternative query by idempotency_key:**
```
GET /api/swap?idempotency_key=coldcash-g0003:w2
```

**Response (swap completed):**
```json
{
  "swap_id": "swap_abc123xyz",
  "status": "completed",
  "kx_received": 39450.0,
  "usdc_sent": 125.50,
  "rate": 0.003185,
  "idempotency_key": "coldcash-g0003:w2",
  "memo": "g0003 window 2 payout",
  "tx_refs": {
    "kx_deposit": "chronx_tx_hash_abc",
    "usdc_send": "base_tx_hash_def"
  },
  "created_at": 1720134520000,
  "completed_at": 1720134580000
}
```

**Response (swap pending):**
```json
{
  "swap_id": "swap_abc123xyz",
  "status": "pending",
  "kx_received": 39450.0,
  "usdc_estimate": 125.50,
  "idempotency_key": "coldcash-g0003:w2",
  "created_at": 1720134520000,
  "updated_at": 1720134540000
}
```

**Status values:**
- `pending`: Swap initiated, awaiting KX deposit confirmation
- `swapped`: KX converted to USDC in pool, awaiting Base transfer
- `completed`: USDC sent to Base address (final state)
- `failed`: Swap failed (insufficient liquidity, deposit timeout, etc.)

**Fields:**
- `swap_id` (string): Unique swap identifier
- `status` (string): Current swap state
- `kx_received` (number): KX amount received (null if not yet confirmed)
- `usdc_sent` (number): USDC amount sent to Base address (null if not yet sent)
- `usdc_estimate` (number): Estimated USDC output (null after completion, replaced by `usdc_sent`)
- `rate` (number): Executed conversion rate (1 KX in USDC)
- `idempotency_key` (string): Key from original request
- `memo` (string, optional): Memo from original request
- `tx_refs` (object, optional): Transaction hashes for on-chain verification
- `created_at` (integer): Unix timestamp (ms) when swap was created
- `completed_at` (integer, optional): Unix timestamp (ms) when swap completed
- `updated_at` (integer): Unix timestamp (ms) of last status change

---

### 3. Webhook: POST <callback_url> (Settlement Confirmation)

**Purpose:** Notify ColdCash/Upon Proof backend when a swap completes, triggering downstream payment legs.

**Configuration:**

ColdCash/Upon Proof provides a webhook URL during initial integration setup (not per-swap). XChan calls this URL when any swap transitions to `completed` or `failed` status.

**Example webhook configuration:**
```
Webhook URL: https://api.uponproof.com/webhooks/xchan/settlement
Secret: <shared_secret_for_signature_verification>
```

**Webhook payload:**
```
POST https://api.uponproof.com/webhooks/xchan/settlement
Content-Type: application/json
X-XChan-Signature: <HMAC-SHA256 signature of payload>

{
  "event": "swap.completed",
  "swap_id": "swap_abc123xyz",
  "status": "completed",
  "kx_received": 39450.0,
  "usdc_sent": 125.50,
  "rate": 0.003185,
  "idempotency_key": "coldcash-g0003:w2",
  "memo": "g0003 window 2 payout",
  "tx_refs": {
    "kx_deposit": "chronx_tx_hash_abc",
    "usdc_send": "base_tx_hash_def"
  },
  "completed_at": 1720134580000
}
```

**Event types:**
- `swap.completed`: USDC successfully sent to Base address
- `swap.failed`: Swap failed (reason in `failure_reason` field)

**Signature verification:**

`X-XChan-Signature` header contains HMAC-SHA256 of the raw payload body, signed with the shared secret. ColdCash backend verifies this signature before processing the webhook to prevent spoofed callbacks.

**Why webhooks are critical:**

ColdCash's payout pipeline has multiple legs:
1. ChronX grant releases KX to operator
2. XChan swaps KX → USDC on Base
3. Upon Proof's fiat adapter swaps USDC → USD and sends PayPal Payout

Leg 3 cannot trigger until Leg 2 completes. Without webhooks, ColdCash must poll GET /api/swap/:swap_id every N seconds, increasing latency and load. Webhooks enable real-time pipeline triggering.

**Fallback if webhooks unavailable:**

If XChan cannot support webhooks in v0.2, specify recommended polling cadence for GET /api/swap/:swap_id (e.g., "poll every 30 seconds until status = completed"). ColdCash will implement polling, but this increases settlement latency.

---

### 4. Memo Passthrough

**Purpose:** Tie each swap to its originating grant and window for audit trails and reconciliation.

**Format:** ColdCash uses the pattern `coldcash-g{grant_id}:w{window_index}` for `idempotency_key` and `memo` fields.

**Examples:**
- `coldcash-g0001:w1` → Grant g0001, window 1
- `coldcash-g0042:w5` → Grant g0042, window 5

**XChan requirements:**
1. Store `idempotency_key` and `memo` with each swap record
2. Return both fields in GET /api/swap responses and webhook payloads
3. Max memo length: 256 characters (UTF-8)
4. Do NOT strip, truncate, or modify memo content

**Why memo passthrough is critical:**

When an operator contacts support asking "Where's my payment for grant g0042, month 5?", ColdCash must trace:
1. ChronX grant window 5 resolution (KX released)
2. XChan swap `coldcash-g0042:w5` (KX → USDC)
3. PayPal payout tied to that swap's `usdc_sent` amount

Without memo passthrough, ColdCash cannot reconcile swaps to grants, making support queries unsolvable and financial audits impossible.

---

## Carried Forward from v0.1: Price Provenance

v0.2 **reinforces** the v0.1 requirement for price provenance:

**Required fields in all quote and swap responses:**
- `rate` (number): Current price of 1 KX in USDC
- `reserve_depth_usdc` (number): Available USDC liquidity in the pool

**Why this remains critical:**

Grant recipients deciding whether to work for KX-denominated promises need:
1. **Real rate:** Not a stale or manipulated price
2. **Pool depth:** Assurance that the exit liquidity exists

A $1000 payout estimate backed by $50,000 in reserves is credible. The same estimate backed by $500 in reserves is not.

**ColdCash's gate:** All programmatic swaps are gated behind `COLDCASH_TRUST_XCHAN_PRICE` flag. Joseph will flip this flag only when:
1. XChan provides `reserve_depth_usdc` in all responses
2. XChan documents its oracle mechanism (on-chain AMM, centralized market maker, hybrid)
3. Joseph confirms the oracle is not easily manipulable or stale

Until then, ColdCash UI displays "rate pending provenance" and does not execute automated swaps.

---

## Explicit Non-Ask: Fiat Rails NOT Requested of XChan

**Critical clarification:**

This v0.2 request does NOT ask XChan to integrate:
- PayPal Payouts (outbound to recipients)
- PayPal deposits (inbound from grantors)
- Bank transfers (ACH, wire, SEPA)
- Credit card on-ramps
- Any fiat currency handling

**Why:**

Upon Proof is building a **pluggable fiat adapter** that sits downstream of XChan. The adapter:
1. Receives USDC on Base from XChan swaps
2. Swaps USDC → USD via a stablecoin offramp (e.g., Coinbase Commerce, Circle, or centralized exchange)
3. Executes PayPal Payout to recipient's PayPal email
4. Handles PayPal compliance (KYC, holds, chargebacks)

XChan remains a **pure KX↔USDC bridge**. This keeps XChan's scope narrow, avoids fiat compliance burden, and allows Upon Proof to swap fiat providers without re-integrating XChan.

**If XChan wants to offer fiat rails in the future:**

Upon Proof would treat that as an alternative fiat adapter, not a replacement for XChan's core bridge. The KX↔USDC swap API (v0.2) would still be used even if fiat rails existed.

---

## Rate Limiting (Updated for v0.2)

ColdCash/Upon Proof will:
- Call POST /api/swap/execute at most once per grant window (typically monthly)
- Poll GET /api/swap/:swap_id at most once per 30 seconds until `status = completed`
- Cache swap status client-side for 30 seconds

We request XChan rate limits of:
- **POST /api/swap/execute**: 10 requests/minute per API key (backend-to-backend)
- **GET /api/swap/:swap_id**: 60 requests/minute per API key
- **Webhook retries**: Max 5 retries over 1 hour (exponential backoff) if ColdCash endpoint fails

---

## Error Handling (Updated for v0.2)

ColdCash will gracefully handle:
- **Swap execution fails (insufficient liquidity)**: Alert operator, hold payout until liquidity returns, retry
- **Swap pending timeout (>1 hour)**: Alert support team, manually investigate, fallback to direct USDC send if KX already received
- **Webhook delivery failure**: XChan retries per above; ColdCash also polls GET /api/swap as fallback
- **Idempotency key collision (same key, different params)**: Log error, alert support, do NOT retry (indicates integration bug)

---

## Security (Updated for v0.2)

- All endpoints must use HTTPS
- POST /api/swap/execute requires API key authentication (not public like v0.1 quote endpoint)
- Webhook payloads must include `X-XChan-Signature` header for HMAC verification
- Idempotency keys are case-sensitive and must match exactly on retry
- `base_usdc_address` validation: must be valid 0x-prefixed Ethereum address, checksummed or lowercase accepted

---

## Timeline

- **v0.1 (2026-07-04)**: GET /api/quote, POST /api/register, GET /api/deposit — SHIPPED
- **v0.2 (this spec, 2026-07-10)**: POST /api/swap/execute, GET /api/swap, webhook settlement confirmation, idempotency, memo passthrough — REQUESTED
- **v0.3 (future)**: Batch swap endpoint, historical swap data, rate lock mechanism (quote → execute with guaranteed rate for N minutes)

---

## Contact

For questions or clarifications on v0.2 spec:
- Email: josephrsanchez@gmail.com
- Project: github.com/josephrsanchez/coldcash-work (private)

---

## v0.2 Summary for XChan Operator

**What ColdCash/Upon Proof needs:**

1. **Programmatic swap execution** — POST /api/swap/execute with idempotency
2. **Settlement confirmation** — Webhook callback OR pollable GET /api/swap status
3. **Audit trail** — Memo passthrough tying swaps to grant windows
4. **Price provenance** — Real oracle rate + reserve depth (carried forward from v0.1)

**What ColdCash/Upon Proof is NOT asking for:**

- Fiat rails (PayPal, ACH, etc.) — that's Upon Proof's fiat adapter, not XChan's responsibility

**Why this matters:**

Upon Proof's First Six Program (see FIRST-SIX-PROGRAM.md) pays node operators monthly in USD, settled via KX→USDC→USD pipeline. XChan is the KX→USDC leg. Without programmatic swap execution and settlement confirmation, the pipeline cannot be automated — every payout would require manual intervention.

**Next step:**

XChan operator reviews this spec, confirms feasibility, and provides:
1. Estimated timeline for v0.2 endpoint availability
2. API key issuance process for ColdCash/Upon Proof backend
3. Testnet/sandbox environment for integration testing

Upon Proof will implement against testnet, run end-to-end payout flow, and sign off before requesting production access.
