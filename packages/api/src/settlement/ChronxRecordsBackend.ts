import type { SettlementBackend, PromiseParams, PromiseRef, PromiseState, TxRef, Address, Hex } from "@coldcash/shared";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { keccak256, encodePacked } from "viem";

// Type_G v1 canonical structure per TYPE-G-CHANGE-REQUESTS.md
export interface TypeGArmedPayload {
  grant_id: string;
  grantor_seat: string;
  grantee_seat: string | null;
  grantor_legal_identity: string;
  pool_kx: string;
  schedule: {
    window_len: number;
    window_cap_kx: string;
    threshold: number;
    renews_until: number;
  };
  expiry_ts: number;
  revert_on_expiry: boolean;
  metric_spec: {
    class: "B";
    n_of_m: number;
    witness_seat: string;
    spec_plaintext: string;
    evidence_hash_required: true;
  };
  payout_curve: Array<[number, number]>;
}

export interface TypeGAcceptanceRecord {
  grant_id: string;
  payload_hash: Hex;
  grantee_seat: string;
  accepted_at: string;
}

export interface TypeGResolutionRecord {
  grant_id: string;
  payload_hash: Hex;
  window: number;
  metric_value: number | null;
  evidence_hash: Hex | null;
  payout_kx: string;
  settlement_ref: string | null;
  resolved_at: string;
}

export interface TypeGRevertRecord {
  grant_id: string;
  payload_hash: Hex;
  reason: "expiry" | "lapse";
  reverted_at: string;
}

export interface ChronxRecordsConfig {
  recordsDir: string;
  grantIdSequencePath: string;
  defaultGrantor: Address;
  witnessIdentity: string;
}

export class ChronxRecordsBackend implements SettlementBackend {
  private config: ChronxRecordsConfig;
  private grantCounter: number;

  constructor(config: ChronxRecordsConfig) {
    this.config = config;
    this.grantCounter = this.loadGrantCounter();
    mkdirSync(join(config.recordsDir, "grants"), { recursive: true });
  }

  private loadGrantCounter(): number {
    if (existsSync(this.config.grantIdSequencePath)) {
      const content = readFileSync(this.config.grantIdSequencePath, "utf-8");
      return parseInt(content.trim(), 10);
    }
    return 0;
  }

  private saveGrantCounter(): void {
    mkdirSync(join(this.config.recordsDir), { recursive: true });
    writeFileSync(this.config.grantIdSequencePath, this.grantCounter.toString());
  }

  private nextGrantId(): string {
    this.grantCounter++;
    this.saveGrantCounter();
    return `coldcash-g${this.grantCounter.toString().padStart(4, "0")}`;
  }

  private computeCanonicalHash(payload: TypeGArmedPayload): Hex {
    // Canonical JSON serialization - order matters for hash stability
    const canonical = JSON.stringify(payload, Object.keys(payload).sort());
    return keccak256(encodePacked(["string"], [canonical]));
  }

  private payoutFromCurve(curve: Array<[number, number]>, metricValue: number | null): string {
    // Fail-closed: null metric => zero payout
    if (metricValue === null) {
      return "0";
    }

    // Find the appropriate payout from the monotone curve
    // Curve format: [[metric_threshold, payout_kx], ...]
    // Sorted by metric_threshold ascending
    let payout = 0;
    for (const [threshold, payoutKx] of curve) {
      if (metricValue >= threshold) {
        payout = payoutKx;
      } else {
        break;
      }
    }

    return payout.toString();
  }

  async createPromise(params: PromiseParams): Promise<PromiseRef> {
    const grantId = this.nextGrantId();

    // Generate Type_G ARMED payload per v1 spec
    // Mirror the inaugural instance: coldcash-g0001 used pool 1000 KX, github-merge Class B metric, trivial step curve
    const payload: TypeGArmedPayload = {
      grant_id: grantId,
      grantor_seat: params.backer,
      grantee_seat: null,
      grantor_legal_identity: this.config.defaultGrantor,
      pool_kx: params.prize.toString(),
      schedule: {
        window_len: params.deadline - params.acceptBy,
        window_cap_kx: params.prize.toString(),
        threshold: 1,
        renews_until: params.deadline
      },
      expiry_ts: params.deadline,
      revert_on_expiry: true,
      metric_spec: {
        class: "B",
        n_of_m: 1,
        witness_seat: this.config.witnessIdentity,
        spec_plaintext: params.standardHash,
        evidence_hash_required: true
      },
      payout_curve: [[1, Number(params.prize)]]
    };

    const payloadHash = this.computeCanonicalHash(payload);

    // Persist to records/grants/<grant_id>-armed.json
    const armedPath = join(this.config.recordsDir, "grants", `${grantId}-armed.json`);
    writeFileSync(armedPath, JSON.stringify(payload, null, 2) + "\n");

    // Also write the canonical hash
    const hashPath = join(this.config.recordsDir, "grants", `${grantId}-hash.txt`);
    writeFileSync(hashPath, payloadHash);

    // NOTE: Records-first means enforcement is operational (operator-signed KX transfer
    // on the live chain referencing the resolution record) until re-genesis makes it
    // mechanical. The resolution record includes a settlement_ref field for the eventual
    // chain transfer id.

    return {
      chainId: 0,
      address: grantId as Address,
      asset: "KX"
    };
  }

  async cancel(ref: PromiseRef): Promise<TxRef> {
    // Records-first: cancel is a revert record
    const grantId = ref.address;
    const armedPath = join(this.config.recordsDir, "grants", `${grantId}-armed.json`);

    if (!existsSync(armedPath)) {
      throw new Error(`Grant ${grantId} not found`);
    }

    const payload = JSON.parse(readFileSync(armedPath, "utf-8")) as TypeGArmedPayload;
    const payloadHash = this.computeCanonicalHash(payload);

    const revertRecord: TypeGRevertRecord = {
      grant_id: grantId,
      payload_hash: payloadHash,
      reason: "lapse",
      reverted_at: new Date().toISOString()
    };

    const revertPath = join(this.config.recordsDir, "grants", `${grantId}-revert.json`);
    writeFileSync(revertPath, JSON.stringify(revertRecord, null, 2) + "\n");

    return {
      chainId: 0,
      hash: payloadHash
    };
  }

  async accept(ref: PromiseRef, seeker: Address): Promise<TxRef> {
    const grantId = ref.address;
    const armedPath = join(this.config.recordsDir, "grants", `${grantId}-armed.json`);

    if (!existsSync(armedPath)) {
      throw new Error(`Grant ${grantId} not found`);
    }

    const payload = JSON.parse(readFileSync(armedPath, "utf-8")) as TypeGArmedPayload;
    payload.grantee_seat = seeker;

    // Update the armed payload with grantee
    writeFileSync(armedPath, JSON.stringify(payload, null, 2) + "\n");

    const payloadHash = this.computeCanonicalHash(payload);

    const acceptanceRecord: TypeGAcceptanceRecord = {
      grant_id: grantId,
      payload_hash: payloadHash,
      grantee_seat: seeker,
      accepted_at: new Date().toISOString()
    };

    const acceptPath = join(this.config.recordsDir, "grants", `${grantId}-accept.json`);
    writeFileSync(acceptPath, JSON.stringify(acceptanceRecord, null, 2) + "\n");

    return {
      chainId: 0,
      hash: payloadHash
    };
  }

  async resolve(ref: PromiseRef, bps: number, evidenceHash: Hex): Promise<TxRef> {
    const grantId = ref.address;
    const armedPath = join(this.config.recordsDir, "grants", `${grantId}-armed.json`);

    if (!existsSync(armedPath)) {
      throw new Error(`Grant ${grantId} not found`);
    }

    const payload = JSON.parse(readFileSync(armedPath, "utf-8")) as TypeGArmedPayload;
    const payloadHash = this.computeCanonicalHash(payload);

    // Compute payout from curve
    // bps is 0-10000; convert to metric value (0 or 1 for binary, or fractional)
    const metricValue = bps === 0 ? null : bps / 10000;
    const payoutKx = this.payoutFromCurve(payload.payout_curve, metricValue);

    const resolutionRecord: TypeGResolutionRecord = {
      grant_id: grantId,
      payload_hash: payloadHash,
      window: 1,
      metric_value: metricValue,
      evidence_hash: evidenceHash,
      payout_kx: payoutKx,
      settlement_ref: null,
      resolved_at: new Date().toISOString()
    };

    const resolvePath = join(this.config.recordsDir, "grants", `${grantId}-resolve.json`);
    writeFileSync(resolvePath, JSON.stringify(resolutionRecord, null, 2) + "\n");

    return {
      chainId: 0,
      hash: payloadHash
    };
  }

  async refund(ref: PromiseRef): Promise<TxRef> {
    const grantId = ref.address;
    const armedPath = join(this.config.recordsDir, "grants", `${grantId}-armed.json`);

    if (!existsSync(armedPath)) {
      throw new Error(`Grant ${grantId} not found`);
    }

    const payload = JSON.parse(readFileSync(armedPath, "utf-8")) as TypeGArmedPayload;
    const payloadHash = this.computeCanonicalHash(payload);

    const revertRecord: TypeGRevertRecord = {
      grant_id: grantId,
      payload_hash: payloadHash,
      reason: "expiry",
      reverted_at: new Date().toISOString()
    };

    const revertPath = join(this.config.recordsDir, "grants", `${grantId}-revert.json`);
    writeFileSync(revertPath, JSON.stringify(revertRecord, null, 2) + "\n");

    return {
      chainId: 0,
      hash: payloadHash
    };
  }

  async status(ref: PromiseRef): Promise<PromiseState> {
    const grantId = ref.address;
    const armedPath = join(this.config.recordsDir, "grants", `${grantId}-armed.json`);

    if (!existsSync(armedPath)) {
      throw new Error(`Grant ${grantId} not found`);
    }

    const payload = JSON.parse(readFileSync(armedPath, "utf-8")) as TypeGArmedPayload;
    const acceptPath = join(this.config.recordsDir, "grants", `${grantId}-accept.json`);
    const resolvePath = join(this.config.recordsDir, "grants", `${grantId}-resolve.json`);
    const revertPath = join(this.config.recordsDir, "grants", `${grantId}-revert.json`);

    let status: "Offered" | "Accepted" | "Paid" | "Refunded" | "Canceled" = "Offered";
    let paidBps: number | undefined;

    if (existsSync(resolvePath)) {
      status = "Paid";
      const resolution = JSON.parse(readFileSync(resolvePath, "utf-8")) as TypeGResolutionRecord;
      paidBps = resolution.metric_value !== null ? Math.round(resolution.metric_value * 10000) : 0;
    } else if (existsSync(revertPath)) {
      const revert = JSON.parse(readFileSync(revertPath, "utf-8")) as TypeGRevertRecord;
      status = revert.reason === "lapse" ? "Canceled" : "Refunded";
    } else if (existsSync(acceptPath)) {
      status = "Accepted";
    }

    return {
      status,
      backer: payload.grantor_seat as Address,
      seeker: payload.grantee_seat ? (payload.grantee_seat as Address) : undefined,
      prize: BigInt(payload.pool_kx),
      acceptBy: payload.expiry_ts - payload.schedule.window_len,
      deadline: payload.expiry_ts,
      standardHash: payload.metric_spec.spec_plaintext as Hex,
      isPublic: false,
      paidBps
    };
  }
}
