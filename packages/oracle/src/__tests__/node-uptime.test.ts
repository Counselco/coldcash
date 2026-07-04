import { describe, it, expect } from "vitest";
import { NodeUptimeAdapter, FixtureTelemetryClient, type NodeUptimeStandard } from "../adapters/node-uptime.js";

describe("NodeUptimeAdapter", () => {
  it("before deadline → pending", async () => {
    const telemetryClient = new FixtureTelemetryClient();
    telemetryClient.setUptime("node123", 7, 30);

    const adapter = new NodeUptimeAdapter(telemetryClient);
    const standard: NodeUptimeStandard = {
      kind: "node-uptime",
      nodeId: "node123",
      requiredDays: 7,
      windowDays: 30,
      deadline: Math.floor(Date.now() / 1000) + 86400
    };

    const result = await adapter.evaluateWithStandard(standard);
    expect(result).toBe("pending");
  });

  it("at deadline, full uptime → 10000 bps", async () => {
    const telemetryClient = new FixtureTelemetryClient();
    telemetryClient.setUptime("node123", 7, 30);

    const adapter = new NodeUptimeAdapter(telemetryClient);
    const deadline = Math.floor(Date.now() / 1000) - 100;
    const standard: NodeUptimeStandard = {
      kind: "node-uptime",
      nodeId: "node123",
      requiredDays: 7,
      windowDays: 30,
      deadline
    };

    const result = await adapter.evaluateWithStandard(standard, deadline + 100);
    expect(result).not.toBe("pending");

    if (result !== "pending") {
      expect(result.bps).toBe(10_000);
      expect(result.evidenceHash).toMatch(/^0x[0-9a-f]{64}$/);
    }
  });

  it("partial uptime → graded bps", async () => {
    const telemetryClient = new FixtureTelemetryClient();
    telemetryClient.setUptime("node456", 5, 30);

    const adapter = new NodeUptimeAdapter(telemetryClient);
    const deadline = Math.floor(Date.now() / 1000) - 100;
    const standard: NodeUptimeStandard = {
      kind: "node-uptime",
      nodeId: "node456",
      requiredDays: 10,
      windowDays: 30,
      deadline
    };

    const result = await adapter.evaluateWithStandard(standard, deadline + 100);
    expect(result).not.toBe("pending");

    if (result !== "pending") {
      // 5/10 = 0.5 → 5000 bps
      expect(result.bps).toBe(5_000);
      expect(result.evidenceHash).toMatch(/^0x[0-9a-f]{64}$/);
    }
  });

  it("excess uptime capped at 10000 bps", async () => {
    const telemetryClient = new FixtureTelemetryClient();
    telemetryClient.setUptime("node789", 15, 30);

    const adapter = new NodeUptimeAdapter(telemetryClient);
    const deadline = Math.floor(Date.now() / 1000) - 100;
    const standard: NodeUptimeStandard = {
      kind: "node-uptime",
      nodeId: "node789",
      requiredDays: 7,
      windowDays: 30,
      deadline
    };

    const result = await adapter.evaluateWithStandard(standard, deadline + 100);
    expect(result).not.toBe("pending");

    if (result !== "pending") {
      // min(15/7, 1) = 1 → 10000 bps
      expect(result.bps).toBe(10_000);
    }
  });

  it("no telemetry data → 0 bps", async () => {
    const telemetryClient = new FixtureTelemetryClient();
    // No uptime set for node999

    const adapter = new NodeUptimeAdapter(telemetryClient);
    const deadline = Math.floor(Date.now() / 1000) - 100;
    const standard: NodeUptimeStandard = {
      kind: "node-uptime",
      nodeId: "node999",
      requiredDays: 7,
      windowDays: 30,
      deadline
    };

    const result = await adapter.evaluateWithStandard(standard, deadline + 100);
    expect(result).not.toBe("pending");

    if (result !== "pending") {
      expect(result.bps).toBe(0);
      expect(result.evidenceHash).toMatch(/^0x[0-9a-f]{64}$/);
    }
  });

  it("zero uptime → 0 bps", async () => {
    const telemetryClient = new FixtureTelemetryClient();
    telemetryClient.setUptime("node000", 0, 30);

    const adapter = new NodeUptimeAdapter(telemetryClient);
    const deadline = Math.floor(Date.now() / 1000) - 100;
    const standard: NodeUptimeStandard = {
      kind: "node-uptime",
      nodeId: "node000",
      requiredDays: 7,
      windowDays: 30,
      deadline
    };

    const result = await adapter.evaluateWithStandard(standard, deadline + 100);
    expect(result).not.toBe("pending");

    if (result !== "pending") {
      expect(result.bps).toBe(0);
    }
  });

  it("evidenceHash is deterministic", async () => {
    const telemetryClient = new FixtureTelemetryClient();
    telemetryClient.setUptime("node123", 7, 30);

    const adapter = new NodeUptimeAdapter(telemetryClient);
    const deadline = Math.floor(Date.now() / 1000) - 100;
    const standard: NodeUptimeStandard = {
      kind: "node-uptime",
      nodeId: "node123",
      requiredDays: 7,
      windowDays: 30,
      deadline
    };

    const result1 = await adapter.evaluateWithStandard(standard, deadline + 100);
    const result2 = await adapter.evaluateWithStandard(standard, deadline + 100);

    expect(result1).not.toBe("pending");
    expect(result2).not.toBe("pending");

    if (result1 !== "pending" && result2 !== "pending") {
      expect(result1.evidenceHash).toBe(result2.evidenceHash);
    }
  });
});
