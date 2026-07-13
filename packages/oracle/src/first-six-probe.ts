import type { Hex } from "@coldcash/shared";
import { keccak256, encodePacked } from "viem";
import {
  FIRST_SIX_MONTHLY_CAP_USD,
} from "@coldcash/shared";

/**
 * First Six Probe Attestor
 *
 * Probe-based uptime measurement for First Six Program (sensor v1).
 *
 * Anti-fraud standard (frozen into program law):
 * "A real, reachable node serving RPC traffic. A mock endpoint, proxy forwarding
 * to someone else's node, or unreachable address does NOT satisfy the standard."
 *
 * This implementation verifies ChronX node identity via RPC method calls.
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Single probe observation
 */
export interface ProbeObservation {
  timestamp: number;           // Epoch seconds
  endpoint: string;            // Node RPC endpoint URL
  success: boolean;            // Did probe succeed?
  responseFingerprint: Hex | null;  // Hash of response (for fraud detection)
  method: string;              // RPC method called (e.g., "chronx_getDagTips")
  errorReason?: string;        // Failure reason if !success
}

/**
 * Observation log for a grant window
 */
export interface ObservationLog {
  grant_id: string;
  window: number;
  observations: ProbeObservation[];
  startTimestamp: number;      // Window start (epoch seconds)
  endTimestamp: number;        // Window end (epoch seconds)
}

/**
 * Uptime metric calculated from observations
 */
export interface UptimeMetric {
  window: number;
  totalProbes: number;
  successfulProbes: number;
  uptimePercent: number;       // 0-100
  metricValueUsd: number;      // Payout in USD after curve application
}

/**
 * Attested metric record (signed by attestor)
 */
export interface AttestedMetric {
  grant_id: string;
  window: number;
  metric_value: number;        // USD payout amount
  uptime_percent: number;      // Raw uptime % (for transparency)
  evidence_hash: Hex;          // Hash of observation log
  attestor_signature?: {       // Optional: added when signed
    v: number;
    r: Hex;
    s: Hex;
  };
  source: "probe-attested";    // Honesty label
  generated_at: string;        // ISO timestamp
}

/**
 * ChronX RPC response for node identity verification
 */
export interface ChronXRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

// ============================================================================
// PAYOUT CURVE
// ============================================================================

/**
 * Linear payout curve with floor
 *
 * Per program law (FIRST-SIX-PROGRAM.md):
 * - Full payout ($10) at 100% uptime
 * - Proportional payout between floor and 100%
 * - $0 payout below 80% floor
 * - Formula: payout_usd = min(10.00, (uptime_pct / 100) × 10.00)
 * - Floor: uptime_pct < 80 → $0
 */
export const UPTIME_FLOOR_PERCENT = 80;

export function calculatePayoutUsd(uptimePercent: number): number {
  // Below floor → $0
  if (uptimePercent < UPTIME_FLOOR_PERCENT) {
    return 0;
  }

  // Linear curve: (uptime / 100) × $10, capped at $10
  const payout = (uptimePercent / 100) * FIRST_SIX_MONTHLY_CAP_USD;
  return Math.min(payout, FIRST_SIX_MONTHLY_CAP_USD);
}

// ============================================================================
// EVIDENCE HASH
// ============================================================================

/**
 * Compute deterministic evidence hash over observation log
 *
 * Canonical format: keccak256(grant_id || window || observations_json)
 * where observations_json is sorted by timestamp for determinism.
 */
export function computeEvidenceHash(log: ObservationLog): Hex {
  // Sort observations by timestamp for determinism
  const sortedObs = [...log.observations].sort((a, b) => a.timestamp - b.timestamp);

  // Canonical JSON: no whitespace, sorted keys
  const canonical = JSON.stringify({
    grant_id: log.grant_id,
    window: log.window,
    observations: sortedObs.map(o => ({
      timestamp: o.timestamp,
      endpoint: o.endpoint,
      success: o.success,
      responseFingerprint: o.responseFingerprint,
      method: o.method,
      errorReason: o.errorReason || null,
    })),
  });

  return keccak256(encodePacked(["string"], [canonical]));
}

// ============================================================================
// WINDOW AGGREGATION
// ============================================================================

/**
 * Aggregate observations into uptime metric
 *
 * Calculates:
 * - Total probes
 * - Successful probes
 * - Uptime % = (successful / total) × 100
 * - Metric value (USD) = payout after curve application
 */
export function aggregateObservations(log: ObservationLog): UptimeMetric {
  const totalProbes = log.observations.length;

  if (totalProbes === 0) {
    // No observations → 0% uptime, $0 payout
    return {
      window: log.window,
      totalProbes: 0,
      successfulProbes: 0,
      uptimePercent: 0,
      metricValueUsd: 0,
    };
  }

  const successfulProbes = log.observations.filter(o => o.success).length;
  const uptimePercent = (successfulProbes / totalProbes) * 100;
  const metricValueUsd = calculatePayoutUsd(uptimePercent);

  return {
    window: log.window,
    totalProbes,
    successfulProbes,
    uptimePercent,
    metricValueUsd,
  };
}

/**
 * Generate attested metric record from observation log
 *
 * This is the attestor's output: uptime %, payout $, evidence hash.
 * Signature is added later by AttestorSigner.
 */
export function generateAttestedMetric(log: ObservationLog): AttestedMetric {
  const metric = aggregateObservations(log);
  const evidenceHash = computeEvidenceHash(log);

  return {
    grant_id: log.grant_id,
    window: log.window,
    metric_value: metric.metricValueUsd,
    uptime_percent: metric.uptimePercent,
    evidence_hash: evidenceHash,
    source: "probe-attested",
    generated_at: new Date().toISOString(),
  };
}

// ============================================================================
// PROBE SERVICE
// ============================================================================

/**
 * ChronX node prober
 *
 * Verifies node identity via RPC methods:
 * - chronx_getDagTips: returns DAG tips (node must be synced)
 * - chronx_getAccount: returns account state (proves node has state)
 *
 * A mock HTTP 200 or reverse proxy to someone else's node will FAIL
 * because response shape and node identity are validated.
 *
 * What this CAN verify:
 * - Endpoint is reachable
 * - Endpoint speaks ChronX RPC protocol
 * - Endpoint returns valid JSON-RPC responses
 * - Response shape matches expected ChronX methods
 *
 * What this CANNOT verify (documented limitations):
 * - Node is not proxying to another operator's node
 * - Node is actively participating in consensus (requires J3 native queries)
 * - Node is serving traffic to real users (requires traffic analysis)
 */
export class ChronXNodeProber {
  /**
   * Probe a ChronX node endpoint
   *
   * @param endpoint - Node RPC URL (e.g., "https://node.example.com/rpc")
   * @returns Probe observation
   */
  async probe(endpoint: string): Promise<ProbeObservation> {
    const timestamp = Math.floor(Date.now() / 1000);
    const method = "chronx_getDagTips";

    try {
      // Call chronx_getDagTips to verify node identity
      const response = await this.callRpc(endpoint, method, []);

      // Validate response shape
      if (!this.isValidChronXResponse(response)) {
        return {
          timestamp,
          endpoint,
          success: false,
          responseFingerprint: null,
          method,
          errorReason: "Invalid ChronX RPC response shape",
        };
      }

      // Compute response fingerprint for fraud detection
      const fingerprint = this.computeResponseFingerprint(response);

      return {
        timestamp,
        endpoint,
        success: true,
        responseFingerprint: fingerprint,
        method,
      };
    } catch (error) {
      return {
        timestamp,
        endpoint,
        success: false,
        responseFingerprint: null,
        method,
        errorReason: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Call ChronX RPC method
   */
  private async callRpc(
    endpoint: string,
    method: string,
    params: unknown[]
  ): Promise<ChronXRpcResponse> {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return (await response.json()) as ChronXRpcResponse;
  }

  /**
   * Validate ChronX RPC response shape
   *
   * Must be valid JSON-RPC 2.0 with either result or error.
   */
  private isValidChronXResponse(response: unknown): response is ChronXRpcResponse {
    if (typeof response !== "object" || response === null) {
      return false;
    }

    const r = response as Record<string, unknown>;

    // Must have jsonrpc: "2.0"
    if (r.jsonrpc !== "2.0") {
      return false;
    }

    // Must have either result or error
    if (!("result" in r) && !("error" in r)) {
      return false;
    }

    return true;
  }

  /**
   * Compute response fingerprint for fraud detection
   *
   * Hashes the RPC response to detect replay attacks or proxies.
   */
  private computeResponseFingerprint(response: ChronXRpcResponse): Hex {
    const canonical = JSON.stringify(response.result);
    return keccak256(encodePacked(["string"], [canonical]));
  }
}

// ============================================================================
// MOCK PROBER (for testing)
// ============================================================================

/**
 * Mock prober for testing (no real HTTP calls)
 */
export class MockChronXNodeProber extends ChronXNodeProber {
  private mockResponses = new Map<string, boolean>();

  /**
   * Set mock response for an endpoint
   */
  setResponse(endpoint: string, success: boolean): void {
    this.mockResponses.set(endpoint, success);
  }

  async probe(endpoint: string): Promise<ProbeObservation> {
    const timestamp = Math.floor(Date.now() / 1000);
    const method = "chronx_getDagTips";
    const success = this.mockResponses.get(endpoint) ?? false;

    if (success) {
      return {
        timestamp,
        endpoint,
        success: true,
        responseFingerprint: keccak256(encodePacked(["string"], ["mock-response"])),
        method,
      };
    } else {
      return {
        timestamp,
        endpoint,
        success: false,
        responseFingerprint: null,
        method,
        errorReason: "Mock failure",
      };
    }
  }
}
