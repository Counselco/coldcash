import type { IntakeCtx, FrozenStandard, SanitizedClaim } from "./types.js";
import type { Dossier } from "./dossier.js";

export interface DraftStandard {
  goal: string;
  success_criteria: string;
  evidence_required: string;
}

export interface ModelProvider {
  draftIntake(wish: string, ctx: IntakeCtx): Promise<DraftStandard>;
  assembleDossier(claim: SanitizedClaim, standard: FrozenStandard): Promise<Dossier>;
}
