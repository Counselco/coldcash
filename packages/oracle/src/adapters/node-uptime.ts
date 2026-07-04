import type { OracleAdapter } from "@coldcash/shared";
import type { PromiseRecord, Hex } from "@coldcash/shared";
import { keccak256, encodePacked } from "viem";

export interface NodeUptimeStandard {
  kind: "node-uptime";
  nodeId: string;
  requiredDays: number;
  windowDays: number;
  deadline: number;
}

export interface UptimeRecord {
  nodeId: string;
  daysUp: number;
  windowDays: number;
  measuredAt: number;
}

/**
 * TelemetryClient interface — ChronX node endpoint plugs in post-re-genesis
 * v1: fixture client for tests
 */
export interface TelemetryClient {
  getUptime(nodeId: string, windowDays: number): Promise<UptimeRecord | null>;
}

/**
 * Fixture telemetry client for testing
 * Returns deterministic uptime records
 */
export class FixtureTelemetryClient implements TelemetryClient {
  private records = new Map<string, UptimeRecord>();

  setUptime(nodeId: string, daysUp: number, windowDays: number): void {
    this.records.set(nodeId, {
      nodeId,
      daysUp,
      windowDays,
      measuredAt: Math.floor(Date.now() / 1000)
    });
  }

  async getUptime(nodeId: string, windowDays: number): Promise<UptimeRecord | null> {
    return this.records.get(nodeId) || null;
  }
}

export class NodeUptimeAdapter implements OracleAdapter {
  readonly id = "node-uptime";
  private telemetryClient: TelemetryClient;

  constructor(telemetryClient: TelemetryClient) {
    this.telemetryClient = telemetryClient;
  }

  async evaluate(promise: PromiseRecord): Promise<{ bps: number; evidenceHash: Hex } | "pending"> {
    throw new Error("evaluate() requires a parsed standard. Use evaluateWithStandard() instead.");
  }

  async evaluateWithStandard(
    standard: NodeUptimeStandard,
    currentTime?: number
  ): Promise<{ bps: number; evidenceHash: Hex } | "pending"> {
    const now = currentTime ?? Math.floor(Date.now() / 1000);

    // Before deadline: return pending
    if (now < standard.deadline) {
      return "pending";
    }

    // At/after deadline: fetch telemetry and grade
    const uptimeRecord = await this.telemetryClient.getUptime(
      standard.nodeId,
      standard.windowDays
    );

    if (!uptimeRecord) {
      // No telemetry data available → grade as 0 bps
      const evidenceHash = this.computeEvidenceHash({
        nodeId: standard.nodeId,
        daysUp: 0,
        windowDays: standard.windowDays,
        measuredAt: now
      });

      return { bps: 0, evidenceHash };
    }

    // Graded bps = floor(min(daysUp/requiredDays, 1) * 10000)
    const ratio = Math.min(uptimeRecord.daysUp / standard.requiredDays, 1);
    const bps = Math.floor(ratio * 10_000);

    const evidenceHash = this.computeEvidenceHash(uptimeRecord);

    return { bps, evidenceHash };
  }

  private computeEvidenceHash(record: UptimeRecord): Hex {
    return keccak256(
      encodePacked(
        ["string", "uint256", "uint256", "uint256"],
        [
          record.nodeId,
          BigInt(record.daysUp),
          BigInt(record.windowDays),
          BigInt(record.measuredAt)
        ]
      )
    );
  }
}
