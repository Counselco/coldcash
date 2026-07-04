import type { ModelProvider, DraftStandard } from "@coldcash/shared";
import type { IntakeCtx, FrozenStandard, SanitizedClaim, Dossier } from "@coldcash/shared";

/**
 * Fixture implementation of ModelProvider for testing and v1 demo.
 * Returns deterministic responses with no external API calls.
 * NO AI, NO API KEYS.
 */
export class FixtureModelProvider implements ModelProvider {
  async draftIntake(wish: string, ctx: IntakeCtx): Promise<DraftStandard> {
    const isGitHub = /github|pr|pull request|merge/i.test(wish);

    if (isGitHub) {
      return {
        goal: wish,
        success_criteria: "Pull request merged to main branch before deadline",
        evidence_required: "GitHub webhook confirmation of merge event",
      };
    }

    return {
      goal: wish,
      success_criteria: `Complete the stated goal: ${wish}`,
      evidence_required: "Photo, video, or document evidence showing completion",
    };
  }

  async assembleDossier(claim: SanitizedClaim, standard: FrozenStandard): Promise<Dossier> {
    const hasEvidence = claim.validatorResults && Object.keys(claim.validatorResults).length > 0;

    if (hasEvidence) {
      return {
        confirmed: ["Evidence received and passed validation"],
        asserted: [],
        contradicted: [],
        recommendation_bps: 10_000,
        confidence: "high",
        notes: "Fixture evaluation: all checks passed (deterministic)",
      };
    }

    return {
      confirmed: [],
      asserted: ["Claim submitted but evidence incomplete"],
      contradicted: [],
      recommendation_bps: 0,
      confidence: "low",
      notes: "Fixture evaluation: insufficient evidence (deterministic)",
    };
  }
}
