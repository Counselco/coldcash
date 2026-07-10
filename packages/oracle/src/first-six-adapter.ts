import type { Hex } from "@coldcash/shared";
import type {
  ObservationLog,
  AttestedMetric,
  ChronXNodeProber,
} from "./first-six-probe.js";
import { generateAttestedMetric } from "./first-six-probe.js";

/**
 * First Six Oracle Adapter Seam
 *
 * OracleAdapter interface for First Six Program metric measurement.
 *
 * Two implementations:
 * 1. ProbeAdapter (v1): Probe-based uptime measurement
 * 2. NodeNativeAdapter (future): Consensus-native retention/participation queries
 *
 * Swapping adapters requires ZERO display/backend changes elsewhere.
 * The adapter seam ensures the UI always shows "monthly uptime percentage"
 * regardless of whether the data source is probe-based or consensus-native.
 */

// ============================================================================
// ORACLE ADAPTER INTERFACE
// ============================================================================

/**
 * Oracle adapter for First Six metric measurement
 *
 * All implementations must return the same shape:
 * - grant_id
 * - window (1-5)
 * - metric_value (USD payout after curve)
 * - uptime_percent (raw uptime %, 0-100)
 * - evidence_hash
 * - source (identifies measurement method)
 */
export interface FirstSixOracleAdapter {
  /**
   * Adapter ID (unique identifier)
   */
  readonly id: string;

  /**
   * Get window metric for a grant
   *
   * @param grant_id - Grant identifier
   * @param window - Window number (1-5)
   * @returns Attested metric record, or null if window not complete
   */
  getWindowMetric(
    grant_id: string,
    window: number
  ): Promise<AttestedMetric | null>;
}

// ============================================================================
// PROBE ADAPTER (v1)
// ============================================================================

/**
 * Probe-based uptime adapter (sensor v1)
 *
 * Measures uptime via scheduled probes to operator's node endpoint.
 * Openly labeled as "probe-attested" in all metric records.
 */
export class ProbeAdapter implements FirstSixOracleAdapter {
  readonly id = "probe-v1";

  constructor(
    private prober: ChronXNodeProber,
    private observationStore: ObservationStore
  ) {}

  async getWindowMetric(
    grant_id: string,
    window: number
  ): Promise<AttestedMetric | null> {
    // Fetch observation log for this grant + window
    const log = await this.observationStore.getLog(grant_id, window);

    if (!log) {
      // Window not complete or no observations yet
      return null;
    }

    // Generate attested metric from observations
    const metric = generateAttestedMetric(log);
    return metric;
  }
}

// ============================================================================
// NODE NATIVE ADAPTER (future, J3)
// ============================================================================

/**
 * Node-native adapter (sensor v2, pending J3)
 *
 * Measures uptime via consensus-native queries:
 * - Consecutive window retention (DAG participation)
 * - Participation percentage per window
 *
 * Same display as probe adapter (monthly uptime %), but data source
 * is ChronX consensus records instead of external probes.
 *
 * STUBBED: Implementation pending J3 metric+records work.
 */
export class NodeNativeAdapter implements FirstSixOracleAdapter {
  readonly id = "node-native-v1";

  async getWindowMetric(
    grant_id: string,
    window: number
  ): Promise<AttestedMetric | null> {
    throw new Error(
      "NodeNativeAdapter is pending J3 metric+records work. " +
      "Use ProbeAdapter (v1) for probe-based uptime measurement."
    );
  }
}

// ============================================================================
// OBSERVATION STORE INTERFACE
// ============================================================================

/**
 * Observation store interface
 *
 * Storage backend for probe observations.
 * Implementations: in-memory (testing), SQLite (production), etc.
 */
export interface ObservationStore {
  /**
   * Store a probe observation
   */
  storeObservation(grant_id: string, window: number, observation: any): Promise<void>;

  /**
   * Get observation log for a grant + window
   *
   * Returns null if window not complete or no observations exist.
   */
  getLog(grant_id: string, window: number): Promise<ObservationLog | null>;

  /**
   * Get all windows for a grant
   */
  getWindows(grant_id: string): Promise<number[]>;
}

// ============================================================================
// IN-MEMORY OBSERVATION STORE (testing)
// ============================================================================

/**
 * In-memory observation store for testing
 */
export class InMemoryObservationStore implements ObservationStore {
  private logs = new Map<string, ObservationLog>();

  async storeObservation(
    grant_id: string,
    window: number,
    observation: any
  ): Promise<void> {
    const key = `${grant_id}:${window}`;
    let log = this.logs.get(key);

    if (!log) {
      log = {
        grant_id,
        window,
        observations: [],
        startTimestamp: 0,
        endTimestamp: 0,
      };
      this.logs.set(key, log);
    }

    log.observations.push(observation);
  }

  async getLog(grant_id: string, window: number): Promise<ObservationLog | null> {
    const key = `${grant_id}:${window}`;
    return this.logs.get(key) || null;
  }

  async getWindows(grant_id: string): Promise<number[]> {
    const windows = new Set<number>();
    for (const [key, log] of this.logs.entries()) {
      if (key.startsWith(`${grant_id}:`)) {
        windows.add(log.window);
      }
    }
    return Array.from(windows).sort((a, b) => a - b);
  }

  /**
   * Set complete observation log (for testing)
   */
  setLog(log: ObservationLog): void {
    const key = `${log.grant_id}:${log.window}`;
    this.logs.set(key, log);
  }
}

// ============================================================================
// ADAPTER SEAM DOCUMENTATION
// ============================================================================

/**
 * ADAPTER SEAM DESIGN
 *
 * The FirstSixOracleAdapter interface is the seam between measurement
 * (how we get uptime data) and display (how we show it to operators).
 *
 * Current state (v1):
 * - ProbeAdapter measures uptime via scheduled HTTP probes
 * - Openly labeled as "probe-attested" in all metric records
 * - Operators see: "Monthly uptime: 95% (probe-based measurement)"
 *
 * Future state (v2, post-J3):
 * - NodeNativeAdapter measures uptime via consensus-native queries
 * - Labeled as "consensus-verified" in metric records
 * - Operators see: "Monthly uptime: 95% (consensus-verified)"
 * - Display SAME (monthly uptime %), data source DIFFERENT
 *
 * Swapping adapters:
 * 1. Backend swaps ProbeAdapter → NodeNativeAdapter (1 line change)
 * 2. UI reads metric.source to determine label ("probe-attested" vs "consensus-verified")
 * 3. Display logic unchanged (still shows uptime %, payout $, evidence hash)
 * 4. No retroactive adjustment to existing grants (probe-based grants stay probe-based)
 *
 * Why the seam matters:
 * - Probe-based measurement is sensor v1 (good enough for launch)
 * - Consensus-native measurement is sensor v2 (better, but requires J3 work)
 * - We ship probe-based now, swap to consensus-native later
 * - Zero operator-visible change except the honesty label
 *
 * Example swap code:
 *
 *   // v1 (probe-based)
 *   const adapter = new ProbeAdapter(prober, observationStore);
 *
 *   // v2 (consensus-native, post-J3)
 *   const adapter = new NodeNativeAdapter(chronxClient);
 *
 *   // All downstream code unchanged:
 *   const metric = await adapter.getWindowMetric(grant_id, window);
 *   console.log(metric.uptime_percent, metric.source);
 *
 * CRITICAL: Do not hardcode "probe-attested" anywhere outside ProbeAdapter.
 * All displays must read metric.source to determine the label.
 */
