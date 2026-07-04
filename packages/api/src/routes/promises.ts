import type { Address, PromiseRef } from "@coldcash/shared";

export interface CreatePromiseRequest {
  backer: Address;
  prize: string;
  acceptBy: number;
  deadline: number;
  standardHash: string;
  isPublic: boolean;
  namedSeeker?: Address;
}

export interface CreatePromiseResponse {
  ref: PromiseRef;
  txHash: string;
}

export async function createPromise(req: CreatePromiseRequest): Promise<CreatePromiseResponse> {
  throw new Error("POST /promises - Not implemented");
}

export async function cancelPromise(id: string): Promise<{ txHash: string }> {
  throw new Error(`POST /promises/${id}/cancel - Not implemented`);
}

export async function acceptPromise(id: string, seeker: Address): Promise<{ txHash: string }> {
  throw new Error(`POST /promises/${id}/accept - Not implemented`);
}

export interface SubmitClaimRequest {
  seeker: Address;
  evidenceFiles: Array<{ contentType: string; data: Buffer }>;
}

export async function submitClaim(id: string, req: SubmitClaimRequest): Promise<{ claimId: string }> {
  throw new Error(`POST /promises/${id}/claim - Not implemented`);
}

export interface DecideRequest {
  backer: Address;
  approved: boolean;
  payoutBps?: number;
}

export async function decide(id: string, req: DecideRequest): Promise<{ attestationId: string; txHash?: string }> {
  throw new Error(`POST /promises/${id}/decide - Not implemented`);
}

export async function sweep(id: string): Promise<{ txHash: string }> {
  throw new Error(`POST /promises/${id}/sweep - Not implemented`);
}

export async function getPromise(id: string): Promise<unknown> {
  throw new Error(`GET /promises/${id} - Not implemented`);
}

export interface IntakeRequest {
  wish: string;
  backerAddress: Address;
  isPublic: boolean;
}

export interface IntakeResponse {
  frozen: {
    goal: string;
    success_criteria: string;
    evidence_required: string;
    standardHash: string;
  };
  kind: string;
  isSubjective: boolean;
  requiresConsent: boolean;
  spec: unknown;
}

export async function intake(req: IntakeRequest): Promise<IntakeResponse> {
  const { IntakeEngine } = await import("../intake/engine.js");
  const engine = new IntakeEngine();
  const result = engine.processWish(req);

  return {
    frozen: result.frozen,
    kind: result.spec.kind,
    isSubjective: result.isSubjective,
    requiresConsent: result.requiresConsent,
    spec: result.spec,
  };
}
