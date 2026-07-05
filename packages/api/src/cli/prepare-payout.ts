#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { keccak256, encodePacked } from "viem";

interface TypeGResolutionRecord {
  grant_id: string;
  payload_hash: string;
  window: number;
  metric_value: number | null;
  evidence_hash: string | null;
  payout_kx: string;
  settlement_ref: string | null;
  resolved_at: string;
}

interface SettlementStub {
  grant_id: string;
  window: number;
  payout_kx: string;
  settlement_ref: string | null;
  prepared_at: string;
  resolution_hash: string;
}

function parseArgs(): { resolutionPath: string } {
  const args = process.argv.slice(2);

  let resolutionPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--resolution" && i + 1 < args.length) {
      resolutionPath = args[i + 1];
      i++;
    }
  }

  if (!resolutionPath) {
    console.error("Usage: pnpm --filter @coldcash/api prepare-payout -- --resolution <path>");
    console.error("Example: pnpm --filter @coldcash/api prepare-payout -- --resolution records/grants/coldcash-g0001-resolve.json");
    process.exit(1);
  }

  return { resolutionPath };
}

function computeResolutionHash(record: TypeGResolutionRecord): string {
  // Canonical JSON serialization for hash stability
  const canonical = JSON.stringify(record, Object.keys(record).sort());
  return keccak256(encodePacked(["string"], [canonical]));
}

function main() {
  const { resolutionPath } = parseArgs();

  // Read resolution record
  if (!existsSync(resolutionPath)) {
    console.error(`Error: Resolution record not found: ${resolutionPath}`);
    process.exit(1);
  }

  const resolutionRecord: TypeGResolutionRecord = JSON.parse(
    readFileSync(resolutionPath, "utf-8")
  );

  // Validate record structure
  if (!resolutionRecord.grant_id || resolutionRecord.payout_kx === undefined) {
    console.error("Error: Invalid resolution record - missing grant_id or payout_kx");
    process.exit(1);
  }

  const payoutKx = parseFloat(resolutionRecord.payout_kx);
  if (isNaN(payoutKx) || payoutKx < 0) {
    console.error("Error: Invalid payout_kx value");
    process.exit(1);
  }

  // Zero payout → nothing to settle
  if (payoutKx === 0) {
    console.log("⚠️  Zero payout - no settlement action required");
    console.log(`Grant ID: ${resolutionRecord.grant_id}`);
    console.log(`Window: ${resolutionRecord.window}`);
    console.log(`Metric value: ${resolutionRecord.metric_value ?? "null (fail-closed)"}`);
    process.exit(0);
  }

  // Compute resolution hash for memo
  const resolutionHash = computeResolutionHash(resolutionRecord);

  // Generate chronx-wallet CLI command
  const granteeSeats = "[grantee_seat_from_armed_payload]";  // Operator must look this up
  const memo = `${resolutionRecord.grant_id}:${resolutionHash.slice(0, 10)}`;

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("PAYOUT PREPARATION COMPLETE");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");
  console.log("Grant ID:", resolutionRecord.grant_id);
  console.log("Window:", resolutionRecord.window);
  console.log("Payout:", `${payoutKx.toLocaleString()} KX`);
  console.log("Resolution hash:", resolutionHash);
  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("CHRONX-WALLET COMMAND (REVIEW THEN SIGN)");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");
  console.log("⚠️  THIS TOOL NEVER SIGNS — REVIEW COMMAND, LOOK UP GRANTEE SEAT, THEN EXECUTE MANUALLY");
  console.log("");
  console.log("chronx-wallet transfer \\");
  console.log(`  --to ${granteeSeats} \\`);
  console.log(`  --amount ${payoutKx} \\`);
  console.log(`  --memo "${memo}"`);
  console.log("");
  console.log("After signing and broadcasting, note the transaction ID.");
  console.log("");

  // Generate settlement stub
  const settlementStub: SettlementStub = {
    grant_id: resolutionRecord.grant_id,
    window: resolutionRecord.window,
    payout_kx: resolutionRecord.payout_kx,
    settlement_ref: null,  // Operator fills with chain tx id after executing
    prepared_at: new Date().toISOString(),
    resolution_hash: resolutionHash
  };

  // Write settlement stub
  const settlementDir = join(process.cwd(), "records", "settlements");
  mkdirSync(settlementDir, { recursive: true });

  const stubPath = join(settlementDir, `${resolutionRecord.grant_id}-pending.json`);
  writeFileSync(stubPath, JSON.stringify(settlementStub, null, 2) + "\n");

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("SETTLEMENT STUB CREATED");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");
  console.log("Path:", stubPath);
  console.log("");
  console.log("After executing the transfer, update settlement_ref with the chain tx id:");
  console.log(`  "settlement_ref": "<chronx_tx_id>"`);
  console.log("");
  console.log("✓ Preparation complete");
}

main();
