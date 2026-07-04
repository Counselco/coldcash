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
