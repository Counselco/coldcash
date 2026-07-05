import { keccak256, encodePacked } from "viem";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Minimal armed payload for coldcash-g0001 (ceremonial first grant)
// In production, this would be loaded from records/grants/coldcash-g0001-armed.json
const armedPayload = {
  grant_id: "coldcash-g0001",
  grantor_seat: "0xCounselco",  // placeholder - ceremonial
  grantee_seat: "0xCounselco",  // placeholder - operator will look up actual seat
  pool_kx: "1000",
  expiry_ts: 1893456000,  // 2030-01-01
  standard_hash: "0x0000000000000000000000000000000000000000000000000000000000000000",
  payload_version: 1
};

// Compute payload hash (canonical JSON)
const payloadHash = keccak256(
  encodePacked(["string"], [JSON.stringify(armedPayload, Object.keys(armedPayload).sort())])
);

// Resolution record
const resolutionRecord = {
  grant_id: "coldcash-g0001",
  payload_hash: payloadHash,
  window: 1,
  metric_value: 1,
  evidence_hash: "0x813bba1e31e4e1db333fe1c258926a1fc73deb6c4b282ae82835f9e9f1413664",
  payout_kx: "1000",
  settlement_ref: null,
  resolved_at: new Date().toISOString()
};

// Write resolution
const recordsDir = join(__dirname, "../records/resolutions");
const outputPath = join(recordsDir, "coldcash-g0001-r1.json");
writeFileSync(outputPath, JSON.stringify(resolutionRecord, null, 2) + "\n");

console.log(JSON.stringify(resolutionRecord, null, 2));
console.log("\n✓ Resolution written to:", outputPath);
console.log("Payload Hash:", payloadHash);
