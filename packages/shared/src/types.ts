import type { Address, Hex } from "viem";

export type { Address, Hex };

export interface PromiseRef {
  chainId: number;
  address: Address;
}

export interface TxRef {
  chainId: number;
  hash: Hex;
}

export interface PromiseParams {
  backer: Address;
  prize: bigint;
  acceptBy: number;
  deadline: number;
  standardHash: Hex;
  isPublic: boolean;
  namedSeeker?: Address;
}

export type PromiseStatus = "Offered" | "Canceled" | "Accepted" | "Paid" | "Refunded";

export interface PromiseState {
  status: PromiseStatus;
  backer: Address;
  seeker?: Address;
  prize: bigint;
  acceptBy: number;
  deadline: number;
  standardHash: Hex;
  isPublic: boolean;
  paidBps?: number;
}

export interface PromiseRecord {
  ref: PromiseRef;
  params: PromiseParams;
  seeker?: Address;
  status: PromiseStatus;
}

export interface IntakeCtx {
  backerAddress: Address;
  isPublic: boolean;
}

export interface FrozenStandard {
  goal: string;
  success_criteria: string;
  evidence_required: string;
  standardHash: Hex;
}

export interface SanitizedClaim {
  promiseRef: PromiseRef;
  seeker: Address;
  evidenceHash: Hex;
  validatorResults: Record<string, unknown>;
  submittedAt: number;
}
