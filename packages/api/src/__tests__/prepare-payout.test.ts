import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "child_process";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import type { Hex } from "@coldcash/shared";

const TEST_DIR = join(process.cwd(), "test-prepare-payout");
const TEST_RECORDS_DIR = join(TEST_DIR, "records", "grants");
const TEST_SETTLEMENTS_DIR = join(TEST_DIR, "records", "settlements");

interface TypeGResolutionRecord {
  grant_id: string;
  payload_hash: Hex;
  window: number;
  metric_value: number | null;
  evidence_hash: Hex | null;
  payout_kx: string;
  settlement_ref: string | null;
  resolved_at: string;
}

describe("prepare-payout CLI", () => {
  beforeEach(() => {
    mkdirSync(TEST_RECORDS_DIR, { recursive: true });
    mkdirSync(TEST_SETTLEMENTS_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("generates chronx-wallet command for valid resolution with payout", () => {
    const resolutionRecord: TypeGResolutionRecord = {
      grant_id: "coldcash-g0042",
      payload_hash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex,
      window: 1,
      metric_value: 1,
      evidence_hash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hex,
      payout_kx: "50000",
      settlement_ref: null,
      resolved_at: "2026-07-04T12:00:00.000Z"
    };

    const resolutionPath = join(TEST_RECORDS_DIR, "coldcash-g0042-resolve.json");
    writeFileSync(resolutionPath, JSON.stringify(resolutionRecord, null, 2));

    const output = execSync(
      `cd ${TEST_DIR} && npx tsx ${join(process.cwd(), "src/cli/prepare-payout.ts")} --resolution ${resolutionPath}`,
      { encoding: "utf-8", cwd: join(process.cwd()) }
    );

    // Verify command output
    expect(output).toContain("PAYOUT PREPARATION COMPLETE");
    expect(output).toContain("Grant ID: coldcash-g0042");
    expect(output).toContain("Window: 1");
    expect(output).toContain("Payout: 50,000 KX");
    expect(output).toContain("chronx-wallet transfer");
    expect(output).toContain("--amount 50000");
    expect(output).toContain("--memo \"coldcash-g0042:");
    expect(output).toContain("THIS TOOL NEVER SIGNS");
    expect(output).toContain("SETTLEMENT STUB CREATED");
  });

  it("handles zero payout gracefully", () => {
    const resolutionRecord: TypeGResolutionRecord = {
      grant_id: "coldcash-g0099",
      payload_hash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex,
      window: 1,
      metric_value: null,
      evidence_hash: null,
      payout_kx: "0",
      settlement_ref: null,
      resolved_at: "2026-07-04T12:00:00.000Z"
    };

    const resolutionPath = join(TEST_RECORDS_DIR, "coldcash-g0099-resolve.json");
    writeFileSync(resolutionPath, JSON.stringify(resolutionRecord, null, 2));

    const output = execSync(
      `cd ${TEST_DIR} && pnpm --filter @coldcash/api prepare-payout -- --resolution ${resolutionPath}`,
      { encoding: "utf-8", cwd: process.cwd() }
    );

    expect(output).toContain("Zero payout - no settlement action required");
    expect(output).toContain("Grant ID: coldcash-g0099");
    expect(output).toContain("Metric value: null (fail-closed)");
    expect(output).not.toContain("chronx-wallet transfer");
    expect(output).not.toContain("SETTLEMENT STUB CREATED");
  });

  it("handles partial payout correctly", () => {
    const resolutionRecord: TypeGResolutionRecord = {
      grant_id: "coldcash-g0050",
      payload_hash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex,
      window: 1,
      metric_value: 0.75,
      evidence_hash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hex,
      payout_kx: "37500",
      settlement_ref: null,
      resolved_at: "2026-07-04T12:00:00.000Z"
    };

    const resolutionPath = join(TEST_RECORDS_DIR, "coldcash-g0050-resolve.json");
    writeFileSync(resolutionPath, JSON.stringify(resolutionRecord, null, 2));

    const output = execSync(
      `cd ${TEST_DIR} && pnpm --filter @coldcash/api prepare-payout -- --resolution ${resolutionPath}`,
      { encoding: "utf-8", cwd: process.cwd() }
    );

    expect(output).toContain("Payout: 37,500 KX");
    expect(output).toContain("--amount 37500");
    expect(output).toContain("SETTLEMENT STUB CREATED");
  });

  it("exits with error when resolution file not found", () => {
    const resolutionPath = join(TEST_RECORDS_DIR, "nonexistent-resolve.json");

    expect(() => {
      execSync(
        `cd ${TEST_DIR} && pnpm --filter @coldcash/api prepare-payout -- --resolution ${resolutionPath}`,
        { encoding: "utf-8", stdio: "pipe", cwd: process.cwd() }
      );
    }).toThrow();
  });

  it("exits with error when resolution path not provided", () => {
    expect(() => {
      execSync(
        `cd ${TEST_DIR} && pnpm --filter @coldcash/api prepare-payout`,
        { encoding: "utf-8", stdio: "pipe", cwd: process.cwd() }
      );
    }).toThrow();
  });

  it("computes stable resolution hash", () => {
    const resolutionRecord: TypeGResolutionRecord = {
      grant_id: "coldcash-g0123",
      payload_hash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex,
      window: 1,
      metric_value: 1,
      evidence_hash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hex,
      payout_kx: "25000",
      settlement_ref: null,
      resolved_at: "2026-07-04T12:00:00.000Z"
    };

    const resolutionPath = join(TEST_RECORDS_DIR, "coldcash-g0123-resolve.json");
    writeFileSync(resolutionPath, JSON.stringify(resolutionRecord, null, 2));

    const output = execSync(
      `cd ${TEST_DIR} && pnpm --filter @coldcash/api prepare-payout -- --resolution ${resolutionPath}`,
      { encoding: "utf-8", cwd: process.cwd() }
    );

    // Extract resolution hash from output
    const hashMatch = output.match(/Resolution hash: (0x[0-9a-f]{64})/);
    expect(hashMatch).toBeDefined();

    const hash1 = hashMatch![1];

    // Run again - hash should be identical
    const output2 = execSync(
      `cd ${TEST_DIR} && pnpm --filter @coldcash/api prepare-payout -- --resolution ${resolutionPath}`,
      { encoding: "utf-8", cwd: process.cwd() }
    );

    const hashMatch2 = output2.match(/Resolution hash: (0x[0-9a-f]{64})/);
    const hash2 = hashMatch2![1];

    expect(hash1).toBe(hash2);
  });
});
