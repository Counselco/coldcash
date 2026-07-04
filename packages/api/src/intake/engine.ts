import type { Address, FrozenStandard } from "@coldcash/shared";
import { standardHash } from "@coldcash/shared";
import type { Hex } from "viem";

export interface IntakeInput {
  wish: string;
  backerAddress: Address;
  isPublic: boolean;
}

export interface GitHubMergeSpec {
  kind: "github-merge";
  repo: string;
  prNumber: number;
  deadline: number;
}

export interface ManualAttestationSpec {
  kind: "manual-attestation";
  goal: string;
  success_criteria: string;
  evidence_required: string;
  subjectiveConsent: boolean;
}

export type StandardSpec = GitHubMergeSpec | ManualAttestationSpec;

export interface IntakeResult {
  spec: StandardSpec;
  frozen: FrozenStandard;
  isSubjective: boolean;
  requiresConsent: boolean;
}

export class IntakeEngine {
  /**
   * V1 deterministic intake: parse wish into structured standard.
   * Enforces structural test: action seeker controls + confirming record.
   * GitHub-merge is the primary v1 anchor; manual-attestation is fallback.
   */
  processWish(input: IntakeInput): IntakeResult {
    const githubMatch = this.tryParseGitHubMerge(input.wish);
    if (githubMatch) {
      const spec: GitHubMergeSpec = githubMatch;
      const standard = {
        kind: "github-merge" as const,
        repo: spec.repo,
        prNumber: spec.prNumber,
        deadline: spec.deadline,
      };
      const hash = standardHash(standard);
      const frozen: FrozenStandard = {
        goal: `PR #${spec.prNumber} merged to ${spec.repo}`,
        success_criteria: `Pull request #${spec.prNumber} merged to main branch of ${spec.repo} before Unix timestamp ${spec.deadline}`,
        evidence_required: `GitHub webhook confirming merge event with merge commit SHA`,
        standardHash: hash,
      };
      return {
        spec,
        frozen,
        isSubjective: false,
        requiresConsent: false,
      };
    }

    const manualMatch = this.tryParseManual(input.wish);
    const spec: ManualAttestationSpec = manualMatch;
    const standard = {
      kind: "manual-attestation" as const,
      goal: spec.goal,
      success_criteria: spec.success_criteria,
      evidence_required: spec.evidence_required,
    };
    const hash = standardHash(standard);
    const frozen: FrozenStandard = {
      goal: spec.goal,
      success_criteria: spec.success_criteria,
      evidence_required: spec.evidence_required,
      standardHash: hash,
    };

    const isSubjective = !this.passesStructuralTest(spec);

    return {
      spec,
      frozen,
      isSubjective,
      requiresConsent: isSubjective && !spec.subjectiveConsent,
    };
  }

  private tryParseGitHubMerge(wish: string): GitHubMergeSpec | null {
    const patterns = [
      /merge\s+pr\s*#?(\d+)\s+(?:in|to|for)\s+([a-z0-9_-]+\/[a-z0-9_-]+)/i,
      /(?:pr|pull request)\s*#?(\d+)\s+merged\s+(?:in|to)\s+([a-z0-9_-]+\/[a-z0-9_-]+)/i,
      /github\s+merge\s+([a-z0-9_-]+\/[a-z0-9_-]+)\s+#?(\d+)/i,
    ];

    for (const pattern of patterns) {
      const match = wish.match(pattern);
      if (match) {
        const prNumber = pattern.source.indexOf("(\\d+)") < pattern.source.indexOf("([a-z0-9_-]+")
          ? parseInt(match[1])
          : parseInt(match[2]);
        const repo = pattern.source.indexOf("(\\d+)") < pattern.source.indexOf("([a-z0-9_-]+")
          ? match[2]
          : match[1];

        const deadlineMatch = wish.match(/(?:by|before|deadline)\s+(\d+)/i);
        const deadline = deadlineMatch
          ? parseInt(deadlineMatch[1])
          : Math.floor(Date.now() / 1000) + 604800;

        return {
          kind: "github-merge",
          repo,
          prNumber,
          deadline,
        };
      }
    }

    return null;
  }

  private tryParseManual(wish: string): ManualAttestationSpec {
    const hasConsent = /\b(i understand|subjective|manual|consent)\b/i.test(wish);

    const cleanWish = wish.replace(/\b(i understand|subjective|manual|consent)\b/gi, "").trim();

    return {
      kind: "manual-attestation",
      goal: cleanWish || wish,
      success_criteria: `Achieve: ${cleanWish || wish}`,
      evidence_required: "Photo, video, or document evidence demonstrating completion",
      subjectiveConsent: hasConsent,
    };
  }

  private passesStructuralTest(spec: ManualAttestationSpec): boolean {
    const hasAction = /\b(complete|finish|deliver|submit|upload|send|create|build|write|fix|merge|deploy)\b/i.test(spec.goal);
    const hasRecord = /\b(photo|video|screenshot|document|file|image|receipt|proof|evidence|link|url)\b/i.test(spec.evidence_required);

    return hasAction && hasRecord;
  }
}
