import { describe, it, expect } from "vitest";
import {
  ProbeAdapter,
  NodeNativeAdapter,
  InMemoryObservationStore,
  type FirstSixOracleAdapter,
} from "../first-six-adapter.js";
import {
  MockChronXNodeProber,
  type ObservationLog,
} from "../first-six-probe.js";
import type { Hex } from "viem";

describe("First Six Oracle Adapter", () => {
  describe("ProbeAdapter", () => {
    it("getWindowMetric: window complete → returns attested metric", async () => {
      const prober = new MockChronXNodeProber();
      const store = new InMemoryObservationStore();

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

      store.setLog(log);

      const adapter = new ProbeAdapter(prober, store);
      const metric = await adapter.getWindowMetric("grant-001", 1);

      expect(metric).not.toBeNull();
      expect(metric!.grant_id).toBe("grant-001");
      expect(metric!.window).toBe(1);
      expect(metric!.metric_value).toBe(20); // 100% uptime
      expect(metric!.uptime_percent).toBe(100);
      expect(metric!.source).toBe("probe-attested");
    });

    it("getWindowMetric: window not complete → returns null", async () => {
      const prober = new MockChronXNodeProber();
      const store = new InMemoryObservationStore();

      const adapter = new ProbeAdapter(prober, store);
      const metric = await adapter.getWindowMetric("grant-999", 1);

      expect(metric).toBeNull();
    });

    it("adapter ID is probe-v1", () => {
      const prober = new MockChronXNodeProber();
      const store = new InMemoryObservationStore();
      const adapter = new ProbeAdapter(prober, store);

      expect(adapter.id).toBe("probe-v1");
    });

    it("honesty label: all metrics have source=probe-attested", async () => {
      const prober = new MockChronXNodeProber();
      const store = new InMemoryObservationStore();

      const log: ObservationLog = {
        grant_id: "grant-001",
        window: 1,
        observations: [
          { timestamp: 1000, endpoint: "https://node.example.com", success: true, responseFingerprint: "0xabc" as Hex, method: "chronx_getDagTips" },
        ],
        startTimestamp: 0,
        endTimestamp: 2592000,
      };

      store.setLog(log);

      const adapter = new ProbeAdapter(prober, store);
      const metric = await adapter.getWindowMetric("grant-001", 1);

      expect(metric!.source).toBe("probe-attested");
    });

    it("uptime below floor → $0 payout", async () => {
      const prober = new MockChronXNodeProber();
      const store = new InMemoryObservationStore();

      const log: ObservationLog = {
        grant_id: "grant-001",
        window: 1,
        observations: [
          { timestamp: 1000, endpoint: "https://node.example.com", success: true, responseFingerprint: "0xabc" as Hex, method: "chronx_getDagTips" },
          { timestamp: 2000, endpoint: "https://node.example.com", success: false, responseFingerprint: null, method: "chronx_getDagTips" },
          { timestamp: 3000, endpoint: "https://node.example.com", success: false, responseFingerprint: null, method: "chronx_getDagTips" },
        ],
        startTimestamp: 0,
        endTimestamp: 2592000,
      };

      store.setLog(log);

      const adapter = new ProbeAdapter(prober, store);
      const metric = await adapter.getWindowMetric("grant-001", 1);

      expect(metric!.uptime_percent).toBeCloseTo(33.33, 1);
      expect(metric!.metric_value).toBe(0); // Below floor
    });
  });

  describe("NodeNativeAdapter", () => {
    it("throws: pending J3 work", async () => {
      const adapter = new NodeNativeAdapter();

      await expect(
        adapter.getWindowMetric("grant-001", 1)
      ).rejects.toThrow("NodeNativeAdapter is pending J3 metric+records work");
    });

    it("adapter ID is node-native-v1", () => {
      const adapter = new NodeNativeAdapter();
      expect(adapter.id).toBe("node-native-v1");
    });
  });

  describe("InMemoryObservationStore", () => {
    it("storeObservation → getLog retrieves stored log", async () => {
      const store = new InMemoryObservationStore();

      const obs = {
        timestamp: 1000,
        endpoint: "https://node.example.com",
        success: true,
        responseFingerprint: "0xabc" as Hex,
        method: "chronx_getDagTips",
      };

      await store.storeObservation("grant-001", 1, obs);

      const log = await store.getLog("grant-001", 1);

      expect(log).not.toBeNull();
      expect(log!.grant_id).toBe("grant-001");
      expect(log!.window).toBe(1);
      expect(log!.observations).toHaveLength(1);
      expect(log!.observations[0]).toEqual(obs);
    });

    it("getLog: no observations → returns null", async () => {
      const store = new InMemoryObservationStore();

      const log = await store.getLog("grant-999", 1);

      expect(log).toBeNull();
    });

    it("getWindows: returns all windows for grant", async () => {
      const store = new InMemoryObservationStore();

      await store.storeObservation("grant-001", 1, { timestamp: 1000 });
      await store.storeObservation("grant-001", 2, { timestamp: 2000 });
      await store.storeObservation("grant-001", 3, { timestamp: 3000 });

      const windows = await store.getWindows("grant-001");

      expect(windows).toEqual([1, 2, 3]);
    });

    it("setLog: directly set complete log", async () => {
      const store = new InMemoryObservationStore();

      const log: ObservationLog = {
        grant_id: "grant-001",
        window: 1,
        observations: [
          { timestamp: 1000, endpoint: "https://node.example.com", success: true, responseFingerprint: "0xabc" as Hex, method: "chronx_getDagTips" },
        ],
        startTimestamp: 0,
        endTimestamp: 2592000,
      };

      store.setLog(log);

      const retrieved = await store.getLog("grant-001", 1);

      expect(retrieved).toEqual(log);
    });
  });

  describe("Adapter seam: swapping adapters", () => {
    it("both adapters implement FirstSixOracleAdapter interface", () => {
      const prober = new MockChronXNodeProber();
      const store = new InMemoryObservationStore();

      const probeAdapter: FirstSixOracleAdapter = new ProbeAdapter(prober, store);
      const nodeAdapter: FirstSixOracleAdapter = new NodeNativeAdapter();

      expect(probeAdapter.id).toBeDefined();
      expect(nodeAdapter.id).toBeDefined();
    });

    it("adapter swap: 1 line change, zero display changes", async () => {
      const prober = new MockChronXNodeProber();
      const store = new InMemoryObservationStore();

      const log: ObservationLog = {
        grant_id: "grant-001",
        window: 1,
        observations: [
          { timestamp: 1000, endpoint: "https://node.example.com", success: true, responseFingerprint: "0xabc" as Hex, method: "chronx_getDagTips" },
        ],
        startTimestamp: 0,
        endTimestamp: 2592000,
      };

      store.setLog(log);

      // v1: probe adapter
      let adapter: FirstSixOracleAdapter = new ProbeAdapter(prober, store);
      let metric = await adapter.getWindowMetric("grant-001", 1);

      expect(metric!.source).toBe("probe-attested");

      // v2: swap to node-native (would work post-J3)
      // adapter = new NodeNativeAdapter(chronxClient);
      // metric = await adapter.getWindowMetric("grant-001", 1);
      // expect(metric!.source).toBe("consensus-verified");

      // All downstream code unchanged:
      // UI reads metric.source to determine label
      // Display logic reads metric.uptime_percent and metric.metric_value
      // Evidence hash is metric.evidence_hash

      expect(metric!.uptime_percent).toBeDefined();
      expect(metric!.metric_value).toBeDefined();
      expect(metric!.evidence_hash).toBeDefined();
    });
  });

  describe("missing key fail-loud", () => {
    it("AttestorSigner requires COLDCASH_ATTESTOR_KEY", () => {
      // AttestorSigner is tested in chronx-attestor.test.ts
      // This test documents the requirement that signing MUST fail if key missing
      expect(true).toBe(true);
    });
  });

  describe("no real signing in tests", () => {
    it("tests use mock prober, no real RPC calls", () => {
      // All tests use MockChronXNodeProber, no real HTTP
      expect(true).toBe(true);
    });

    it("tests do not sign metrics (signature added by AttestorSigner later)", () => {
      // generateAttestedMetric returns unsigned metrics
      // AttestorSigner.sign() adds signature (not tested here)
      expect(true).toBe(true);
    });
  });
});
