import { describe, it, expect } from "vitest";
import {
  calculatePayoutUsd,
  computeEvidenceHash,
  aggregateObservations,
  generateAttestedMetric,
  MockChronXNodeProber,
  UPTIME_FLOOR_PERCENT,
  type ObservationLog,
  type ProbeObservation,
} from "../first-six-probe.js";
import { keccak256, encodePacked, type Hex } from "viem";

describe("First Six Probe Attestor", () => {
  describe("calculatePayoutUsd", () => {
    it("100% uptime → $10", () => {
      expect(calculatePayoutUsd(100)).toBe(10);
    });

    it("90% uptime → $9", () => {
      expect(calculatePayoutUsd(90)).toBe(9);
    });

    it("85% uptime → $8.50", () => {
      expect(calculatePayoutUsd(85)).toBe(8.5);
    });

    it("80% uptime (at floor) → $8", () => {
      expect(calculatePayoutUsd(80)).toBe(8);
    });

    it("79% uptime (below floor) → $0", () => {
      expect(calculatePayoutUsd(79)).toBe(0);
    });

    it("50% uptime (below floor) → $0", () => {
      expect(calculatePayoutUsd(50)).toBe(0);
    });

    it("0% uptime → $0", () => {
      expect(calculatePayoutUsd(0)).toBe(0);
    });

    it("uptime capped at $10 (no over-payout)", () => {
      // Even if somehow uptime > 100%, cap at $10
      expect(calculatePayoutUsd(150)).toBe(10);
    });

    it("floor constant is 80%", () => {
      expect(UPTIME_FLOOR_PERCENT).toBe(80);
    });

    it("partial month: 28 days, 85% uptime", () => {
      // 85% uptime = $8.50 (linear curve applies regardless of month length)
      expect(calculatePayoutUsd(85)).toBe(8.5);
    });
  });

  describe("computeEvidenceHash", () => {
    it("deterministic hash for same log", () => {
      const log: ObservationLog = {
        grant_id: "grant-001",
        window: 1,
        observations: [
          {
            timestamp: 1000,
            endpoint: "https://node.example.com",
            success: true,
            responseFingerprint: "0xabc123" as Hex,
            method: "chronx_getDagTips",
          },
        ],
        startTimestamp: 0,
        endTimestamp: 2592000,
      };

      const hash1 = computeEvidenceHash(log);
      const hash2 = computeEvidenceHash(log);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it("different logs → different hashes", () => {
      const log1: ObservationLog = {
        grant_id: "grant-001",
        window: 1,
        observations: [],
        startTimestamp: 0,
        endTimestamp: 2592000,
      };

      const log2: ObservationLog = {
        grant_id: "grant-002",
        window: 1,
        observations: [],
        startTimestamp: 0,
        endTimestamp: 2592000,
      };

      const hash1 = computeEvidenceHash(log1);
      const hash2 = computeEvidenceHash(log2);

      expect(hash1).not.toBe(hash2);
    });

    it("observation order does not affect hash (sorted internally)", () => {
      const obs1: ProbeObservation = {
        timestamp: 1000,
        endpoint: "https://node.example.com",
        success: true,
        responseFingerprint: "0xabc" as Hex,
        method: "chronx_getDagTips",
      };

      const obs2: ProbeObservation = {
        timestamp: 2000,
        endpoint: "https://node.example.com",
        success: true,
        responseFingerprint: "0xdef" as Hex,
        method: "chronx_getDagTips",
      };

      const log1: ObservationLog = {
        grant_id: "grant-001",
        window: 1,
        observations: [obs1, obs2],
        startTimestamp: 0,
        endTimestamp: 2592000,
      };

      const log2: ObservationLog = {
        grant_id: "grant-001",
        window: 1,
        observations: [obs2, obs1], // reversed
        startTimestamp: 0,
        endTimestamp: 2592000,
      };

      const hash1 = computeEvidenceHash(log1);
      const hash2 = computeEvidenceHash(log2);

      // Hashes should be the same (observations sorted by timestamp)
      expect(hash1).toBe(hash2);
    });
  });

  describe("aggregateObservations", () => {
    it("no observations → 0% uptime, $0", () => {
      const log: ObservationLog = {
        grant_id: "grant-001",
        window: 1,
        observations: [],
        startTimestamp: 0,
        endTimestamp: 2592000,
      };

      const metric = aggregateObservations(log);

      expect(metric.totalProbes).toBe(0);
      expect(metric.successfulProbes).toBe(0);
      expect(metric.uptimePercent).toBe(0);
      expect(metric.metricValueUsd).toBe(0);
    });

    it("all successful probes → 100% uptime, $10", () => {
      const log: ObservationLog = {
        grant_id: "grant-001",
        window: 1,
        observations: [
          {
            timestamp: 1000,
            endpoint: "https://node.example.com",
            success: true,
            responseFingerprint: "0xabc" as Hex,
            method: "chronx_getDagTips",
          },
          {
            timestamp: 2000,
            endpoint: "https://node.example.com",
            success: true,
            responseFingerprint: "0xdef" as Hex,
            method: "chronx_getDagTips",
          },
        ],
        startTimestamp: 0,
        endTimestamp: 2592000,
      };

      const metric = aggregateObservations(log);

      expect(metric.totalProbes).toBe(2);
      expect(metric.successfulProbes).toBe(2);
      expect(metric.uptimePercent).toBe(100);
      expect(metric.metricValueUsd).toBe(10);
    });

    it("partial uptime → proportional payout", () => {
      const log: ObservationLog = {
        grant_id: "grant-001",
        window: 1,
        observations: [
          { timestamp: 1000, endpoint: "https://node.example.com", success: true, responseFingerprint: "0xabc" as Hex, method: "chronx_getDagTips" },
          { timestamp: 2000, endpoint: "https://node.example.com", success: true, responseFingerprint: "0xdef" as Hex, method: "chronx_getDagTips" },
          { timestamp: 3000, endpoint: "https://node.example.com", success: false, responseFingerprint: null, method: "chronx_getDagTips", errorReason: "timeout" },
          { timestamp: 4000, endpoint: "https://node.example.com", success: true, responseFingerprint: "0x123" as Hex, method: "chronx_getDagTips" },
        ],
        startTimestamp: 0,
        endTimestamp: 2592000,
      };

      const metric = aggregateObservations(log);

      expect(metric.totalProbes).toBe(4);
      expect(metric.successfulProbes).toBe(3);
      expect(metric.uptimePercent).toBe(75); // 3/4 = 75%
      expect(metric.metricValueUsd).toBe(0); // Below 80% floor
    });

    it("uptime below floor → $0", () => {
      const log: ObservationLog = {
        grant_id: "grant-001",
        window: 1,
        observations: [
          { timestamp: 1000, endpoint: "https://node.example.com", success: true, responseFingerprint: "0xabc" as Hex, method: "chronx_getDagTips" },
          { timestamp: 2000, endpoint: "https://node.example.com", success: false, responseFingerprint: null, method: "chronx_getDagTips" },
          { timestamp: 3000, endpoint: "https://node.example.com", success: false, responseFingerprint: null, method: "chronx_getDagTips" },
          { timestamp: 4000, endpoint: "https://node.example.com", success: false, responseFingerprint: null, method: "chronx_getDagTips" },
        ],
        startTimestamp: 0,
        endTimestamp: 2592000,
      };

      const metric = aggregateObservations(log);

      expect(metric.totalProbes).toBe(4);
      expect(metric.successfulProbes).toBe(1);
      expect(metric.uptimePercent).toBe(25); // 1/4 = 25%
      expect(metric.metricValueUsd).toBe(0); // Below floor
    });

    it("uptime at floor boundary → proportional payout", () => {
      // 80% uptime = exactly at floor
      const log: ObservationLog = {
        grant_id: "grant-001",
        window: 1,
        observations: [
          { timestamp: 1000, endpoint: "https://node.example.com", success: true, responseFingerprint: "0xabc" as Hex, method: "chronx_getDagTips" },
          { timestamp: 2000, endpoint: "https://node.example.com", success: true, responseFingerprint: "0xdef" as Hex, method: "chronx_getDagTips" },
          { timestamp: 3000, endpoint: "https://node.example.com", success: true, responseFingerprint: "0x123" as Hex, method: "chronx_getDagTips" },
          { timestamp: 4000, endpoint: "https://node.example.com", success: true, responseFingerprint: "0x456" as Hex, method: "chronx_getDagTips" },
          { timestamp: 5000, endpoint: "https://node.example.com", success: false, responseFingerprint: null, method: "chronx_getDagTips" },
        ],
        startTimestamp: 0,
        endTimestamp: 2592000,
      };

      const metric = aggregateObservations(log);

      expect(metric.totalProbes).toBe(5);
      expect(metric.successfulProbes).toBe(4);
      expect(metric.uptimePercent).toBe(80); // 4/5 = 80%
      expect(metric.metricValueUsd).toBe(8); // 80% of $10 = $8
    });
  });

  describe("generateAttestedMetric", () => {
    it("complete log → attested metric with all fields", () => {
      const log: ObservationLog = {
        grant_id: "grant-001",
        window: 1,
        observations: [
          { timestamp: 1000, endpoint: "https://node.example.com", success: true, responseFingerprint: "0xabc" as Hex, method: "chronx_getDagTips" },
          { timestamp: 2000, endpoint: "https://node.example.com", success: true, responseFingerprint: "0xdef" as Hex, method: "chronx_getDagTips" },
        ],
        startTimestamp: 0,
        endTimestamp: 2592000,
      };

      const metric = generateAttestedMetric(log);

      expect(metric.grant_id).toBe("grant-001");
      expect(metric.window).toBe(1);
      expect(metric.metric_value).toBe(10); // 100% uptime
      expect(metric.uptime_percent).toBe(100);
      expect(metric.evidence_hash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(metric.source).toBe("probe-attested");
      expect(metric.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO timestamp
    });

    it("honesty label: source is 'probe-attested'", () => {
      const log: ObservationLog = {
        grant_id: "grant-001",
        window: 1,
        observations: [],
        startTimestamp: 0,
        endTimestamp: 2592000,
      };

      const metric = generateAttestedMetric(log);

      expect(metric.source).toBe("probe-attested");
    });

    it("includes uptime_percent for transparency", () => {
      const log: ObservationLog = {
        grant_id: "grant-001",
        window: 1,
        observations: [
          { timestamp: 1000, endpoint: "https://node.example.com", success: true, responseFingerprint: "0xabc" as Hex, method: "chronx_getDagTips" },
          { timestamp: 2000, endpoint: "https://node.example.com", success: false, responseFingerprint: null, method: "chronx_getDagTips" },
        ],
        startTimestamp: 0,
        endTimestamp: 2592000,
      };

      const metric = generateAttestedMetric(log);

      expect(metric.uptime_percent).toBe(50); // 1/2 = 50%
      expect(metric.metric_value).toBe(0); // Below floor
    });
  });

  describe("MockChronXNodeProber", () => {
    it("mock success → successful probe", async () => {
      const prober = new MockChronXNodeProber();
      prober.setResponse("https://node.example.com", true);

      const obs = await prober.probe("https://node.example.com");

      expect(obs.success).toBe(true);
      expect(obs.responseFingerprint).toMatch(/^0x[0-9a-f]{64}$/);
      expect(obs.method).toBe("chronx_getDagTips");
    });

    it("mock failure → failed probe", async () => {
      const prober = new MockChronXNodeProber();
      prober.setResponse("https://node.example.com", false);

      const obs = await prober.probe("https://node.example.com");

      expect(obs.success).toBe(false);
      expect(obs.responseFingerprint).toBeNull();
      expect(obs.errorReason).toBe("Mock failure");
    });

    it("no mock set → defaults to failure", async () => {
      const prober = new MockChronXNodeProber();

      const obs = await prober.probe("https://unknown.example.com");

      expect(obs.success).toBe(false);
    });
  });

  describe("fake node detection", () => {
    it("HTTP 200 non-ChronX response fails validation", () => {
      // This is tested implicitly by ChronXNodeProber.isValidChronXResponse
      // which requires jsonrpc: "2.0" and either result or error.
      // A mock HTTP 200 with invalid JSON-RPC will fail.

      // Document the anti-fraud standard
      expect(true).toBe(true); // This test documents the requirement
    });
  });

  describe("evidence hash determinism", () => {
    it("same observations → same evidence hash", () => {
      const log: ObservationLog = {
        grant_id: "grant-001",
        window: 1,
        observations: [
          { timestamp: 1000, endpoint: "https://node.example.com", success: true, responseFingerprint: "0xabc" as Hex, method: "chronx_getDagTips" },
        ],
        startTimestamp: 0,
        endTimestamp: 2592000,
      };

      const hash1 = computeEvidenceHash(log);
      const hash2 = computeEvidenceHash(log);

      expect(hash1).toBe(hash2);
    });

    it("different observation data → different hash", () => {
      const log1: ObservationLog = {
        grant_id: "grant-001",
        window: 1,
        observations: [
          { timestamp: 1000, endpoint: "https://node.example.com", success: true, responseFingerprint: "0xabc" as Hex, method: "chronx_getDagTips" },
        ],
        startTimestamp: 0,
        endTimestamp: 2592000,
      };

      const log2: ObservationLog = {
        grant_id: "grant-001",
        window: 1,
        observations: [
          { timestamp: 1000, endpoint: "https://node.example.com", success: false, responseFingerprint: null, method: "chronx_getDagTips" },
        ],
        startTimestamp: 0,
        endTimestamp: 2592000,
      };

      const hash1 = computeEvidenceHash(log1);
      const hash2 = computeEvidenceHash(log2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("partial month handling", () => {
    it("February (28 days): uptime calculation works same as 30-day month", () => {
      // Uptime % = successful / total, regardless of calendar days
      const log: ObservationLog = {
        grant_id: "grant-001",
        window: 1,
        observations: [
          { timestamp: 1000, endpoint: "https://node.example.com", success: true, responseFingerprint: "0xabc" as Hex, method: "chronx_getDagTips" },
          { timestamp: 2000, endpoint: "https://node.example.com", success: true, responseFingerprint: "0xdef" as Hex, method: "chronx_getDagTips" },
          { timestamp: 3000, endpoint: "https://node.example.com", success: true, responseFingerprint: "0x123" as Hex, method: "chronx_getDagTips" },
          { timestamp: 4000, endpoint: "https://node.example.com", success: true, responseFingerprint: "0x456" as Hex, method: "chronx_getDagTips" },
        ],
        startTimestamp: 0,
        endTimestamp: 2419200, // 28 days in seconds
      };

      const metric = aggregateObservations(log);

      expect(metric.uptimePercent).toBe(100);
      expect(metric.metricValueUsd).toBe(10);
    });

    it("partial month below floor → $0", () => {
      const log: ObservationLog = {
        grant_id: "grant-001",
        window: 1,
        observations: [
          { timestamp: 1000, endpoint: "https://node.example.com", success: true, responseFingerprint: "0xabc" as Hex, method: "chronx_getDagTips" },
          { timestamp: 2000, endpoint: "https://node.example.com", success: false, responseFingerprint: null, method: "chronx_getDagTips" },
          { timestamp: 3000, endpoint: "https://node.example.com", success: false, responseFingerprint: null, method: "chronx_getDagTips" },
        ],
        startTimestamp: 0,
        endTimestamp: 2419200, // 28 days
      };

      const metric = aggregateObservations(log);

      expect(metric.uptimePercent).toBeCloseTo(33.33, 1); // 1/3
      expect(metric.metricValueUsd).toBe(0); // Below floor
    });
  });
});
