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
