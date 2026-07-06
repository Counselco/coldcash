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

export interface NodeUptimeSpec {
  kind: "node-uptime";
  nodeId: string;
  requiredDays: number;
  windowDays: number;
  deadline: number;
}

export interface ManualAttestationSpec {
  kind: "manual-attestation";
  goal: string;
  success_criteria: string;
  evidence_required: string;
  subjectiveConsent: boolean;
}

export type StandardSpec = GitHubMergeSpec | NodeUptimeSpec | ManualAttestationSpec;

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

    const nodeUptimeMatch = this.tryParseNodeUptime(input.wish);
    if (nodeUptimeMatch) {
      const spec: NodeUptimeSpec = nodeUptimeMatch;
      const standard = {
        kind: "node-uptime" as const,
        nodeId: spec.nodeId,
        requiredDays: spec.requiredDays,
        windowDays: spec.windowDays,
        deadline: spec.deadline,
      };
      const hash = standardHash(standard);
      const frozen: FrozenStandard = {
        goal: `Node ${spec.nodeId} online ≥${spec.requiredDays} of ${spec.windowDays} days`,
        success_criteria: `ChronX node ${spec.nodeId} uptime ≥${spec.requiredDays} days within a ${spec.windowDays}-day window, measured at deadline ${spec.deadline}`,
        evidence_required: `Telemetry data from ChronX node endpoint showing uptime record`,
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

  private tryParseNodeUptime(wish: string): NodeUptimeSpec | null {
    const patterns = [
      /node\s+([a-z0-9_-]+)\s+(?:online|up|uptime)\s+(\d+)\s+(?:of|\/)\s+(\d+)\s+days/i,
      /([a-z0-9_-]+)\s+node\s+(\d+)\s+days?\s+uptime/i,
      /uptime\s+([a-z0-9_-]+)\s+(\d+)\s+days/i,
    ];

    for (const pattern of patterns) {
      const match = wish.match(pattern);
      if (match) {
        let nodeId: string;
        let requiredDays: number;
        let windowDays: number;

        if (pattern.source.includes("of|")) {
          nodeId = match[1];
          requiredDays = parseInt(match[2]);
          windowDays = parseInt(match[3]);
        } else {
          nodeId = match[1];
          requiredDays = parseInt(match[2]);
          windowDays = 30; // default window
        }

        const deadlineMatch = wish.match(/(?:by|before|deadline)\s+(\d+)/i);
        const deadline = deadlineMatch
          ? parseInt(deadlineMatch[1])
          : Math.floor(Date.now() / 1000) + 604800;

        return {
          kind: "node-uptime",
          nodeId,
          requiredDays,
          windowDays,
          deadline,
        };
      }
    }

    return null;
  }

  private tryParseManual(wish: string): ManualAttestationSpec {
    const hasConsent = /\b(i understand|subjective|manual|consent)\b/i.test(wish);

    const cleanWish = wish.replace(/\b(i understand|subjective|manual|consent)\b/gi, "").trim();
    const goal = cleanWish || wish;

    // Derive goal-specific evidence where possible
    const evidence = this.deriveEvidence(goal);

    return {
      kind: "manual-attestation",
      goal,
      success_criteria: `Achieve: ${goal}`,
      evidence_required: evidence,
      subjectiveConsent: hasConsent,
    };
  }

  private deriveEvidence(goal: string): string {
    // If goal explicitly mentions evidence artifacts, reference them
    if (/\b(submit|upload|post|share|send|deliver)\s+(?:a\s+)?(?:photo|video|screenshot|document|file|image|proof)\b/i.test(goal)) {
      return "Submitted photo, video, or document as specified in goal";
    }
    if (/\bmerge\s+pr\b/i.test(goal)) {
      return "GitHub merge confirmation with commit SHA";
    }
    if (/\bscreenshot\b/i.test(goal)) {
      return "Screenshot demonstrating completion";
    }
    if (/\b(homework|assignment|essay|paper|report)\b/i.test(goal)) {
      return "Completed assignment document or submission confirmation";
    }
    if (/\bgrade|gpa|straight\s+a/i.test(goal)) {
      return "Official grade report or transcript";
    }

    // Generic fallback - honest that evidence path is unspecified
    return "Verifiable evidence demonstrating completion";
  }

  private passesStructuralTest(spec: ManualAttestationSpec): boolean {
    const goal = spec.goal.toLowerCase();

    // First: detect inherently subjective goals (feelings, moods, aesthetic judgments)
    if (this.isSubjectiveGoal(goal)) {
      return false;
    }

    // Second: detect "action verb + subjective object" bypass
    // (e.g., "complete having a decent day")
    if (this.hasSubjectiveActionPattern(goal)) {
      return false;
    }

    // Third: check for concrete, controllable action
    const hasConcreteAction = this.hasConcreteAction(goal);

    // Fourth: check if goal references checkable artifacts/deliverables
    // (Check the GOAL itself, not the hardcoded template)
    const hasCheckableEvidence = this.hasCheckableEvidence(goal);

    return hasConcreteAction && hasCheckableEvidence;
  }

  private isSubjectiveGoal(goal: string): boolean {
    // Internal states, feelings, moods, aesthetic judgments
    const subjectivePatterns = [
      /\b(feel|feeling)\s+(better|good|bad|happy|sad|confident|proud|satisfied)/i,
      /\b(be|being|am|is|are)\s+(happy|satisfied|proud|confident|better|content|fulfilled)/i,
      /\bhave\s+a\s+(decent|good|great|nice|wonderful|amazing|productive|successful|better)\s+(day|time|week|morning|evening|experience)/i,
      /\b(impress|satisfy|please)\s+(me|you|them|us|someone|others)/i,
      /\b(mood|morale|spirit|vibe)s?\b/i,
    ];

    return subjectivePatterns.some(pattern => pattern.test(goal));
  }

  private hasSubjectiveActionPattern(goal: string): boolean {
    // "complete/finish having a decent day" — action verb applied to subjective state
    const patterns = [
      /\b(complete|finish|achieve|accomplish)\s+(having|feeling|being)\s+/i,
      /\b(complete|finish|achieve|accomplish)\s+a\s+(decent|good|great|nice|wonderful|happy|satisfied)\s+(day|time|mood|feeling)/i,
    ];

    return patterns.some(pattern => pattern.test(goal));
  }

  private hasConcreteAction(goal: string): boolean {
    // Actions the seeker controls with concrete deliverables
    const concreteActionPatterns = [
      /\b(submit|upload|send|deliver|post|publish|share)\b/i,
      /\bmerge\s+pr\b/i,
      /\b(create|build|write|deploy|fix|complete|finish|earn|get)\b/i,
    ];

    return concreteActionPatterns.some(pattern => pattern.test(goal));
  }

  private hasCheckableEvidence(goal: string): boolean {
    // Goal mentions evidence artifacts, deliverables, or checkable records
    const evidencePatterns = [
      /\b(photo|video|screenshot|document|file|image|receipt|proof|evidence)\b/i,
      /\b(pr|pull\s+request|commit|merge|deploy|link|url)\b/i,
      /\b(homework|assignment|essay|paper|report|grade|transcript|straight\s+a)/i,
      /\b(submission|deliverable|degree|certification|project)\b/i,
    ];

    return evidencePatterns.some(pattern => pattern.test(goal));
  }
}
