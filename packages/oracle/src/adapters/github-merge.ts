import type { OracleAdapter } from "@coldcash/shared";
import type { PromiseRecord, Hex } from "@coldcash/shared";
import { keccak256, encodePacked } from "viem";
import { Octokit } from "@octokit/rest";

export interface GitHubMergeStandard {
  kind: "github-merge";
  repo: string;
  prNumber?: number;
  headBranch?: string;
  deadline: number;
}

export interface GitHubMergeEvidence {
  repo: string;
  prNumber: number;
  mergeCommitSha: string;
  mergedAt: string;
  source: "webhook" | "poll";
}

export interface WebhookEvent {
  action: string;
  pull_request: {
    number: number;
    merged: boolean;
    merged_at: string | null;
    merge_commit_sha: string | null;
    head: {
      ref: string;
    };
    base: {
      repo: {
        full_name: string;
      };
    };
  };
  repository: {
    full_name: string;
  };
}

export class GitHubMergeAdapter implements OracleAdapter {
  readonly id = "github-merge";
  private octokit?: Octokit;

  constructor(githubToken?: string) {
    if (githubToken) {
      this.octokit = new Octokit({ auth: githubToken });
    }
  }

  async evaluate(promise: PromiseRecord): Promise<{ bps: number; evidenceHash: Hex } | "pending"> {
    throw new Error("evaluate() requires a parsed standard. Use evaluateWithStandard() instead.");
  }

  async evaluateWithStandard(
    standard: GitHubMergeStandard,
    evidence?: GitHubMergeEvidence
  ): Promise<{ bps: number; evidenceHash: Hex } | "pending"> {
    if (!evidence) {
      return "pending";
    }

    if (evidence.repo !== standard.repo) {
      return "pending";
    }

    if (standard.prNumber && evidence.prNumber !== standard.prNumber) {
      return "pending";
    }

    const mergedAtTimestamp = Math.floor(new Date(evidence.mergedAt).getTime() / 1000);
    if (mergedAtTimestamp > standard.deadline) {
      return "pending";
    }

    const evidenceHash = this.computeEvidenceHash(evidence);

    return {
      bps: 10_000,
      evidenceHash
    };
  }

  validateWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const crypto = require("crypto");
    const hmac = crypto.createHmac("sha256", secret);
    const digest = "sha256=" + hmac.update(payload).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  }

  async ingestWebhook(event: WebhookEvent, signature: string, secret: string): Promise<GitHubMergeEvidence | null> {
    const payload = JSON.stringify(event);
    if (!this.validateWebhookSignature(payload, signature, secret)) {
      throw new Error("Invalid webhook signature");
    }

    if (event.action !== "closed" || !event.pull_request.merged) {
      return null;
    }

    return {
      repo: event.repository.full_name,
      prNumber: event.pull_request.number,
      mergeCommitSha: event.pull_request.merge_commit_sha!,
      mergedAt: event.pull_request.merged_at!,
      source: "webhook"
    };
  }

  async pollForMerge(standard: GitHubMergeStandard): Promise<GitHubMergeEvidence | null> {
    if (!this.octokit) {
      throw new Error("GitHub token required for poll mode");
    }

    const [owner, repo] = standard.repo.split("/");

    if (standard.prNumber) {
      const { data: pr } = await this.octokit.pulls.get({
        owner,
        repo,
        pull_number: standard.prNumber
      });

      if (!pr.merged || !pr.merged_at || !pr.merge_commit_sha) {
        return null;
      }

      return {
        repo: standard.repo,
        prNumber: pr.number,
        mergeCommitSha: pr.merge_commit_sha,
        mergedAt: pr.merged_at,
        source: "poll"
      };
    }

    if (standard.headBranch) {
      const { data: pulls } = await this.octokit.pulls.list({
        owner,
        repo,
        head: `${owner}:${standard.headBranch}`,
        state: "closed"
      });

      const mergedPr = pulls.find(pr => (pr as any).merged);
      if (!mergedPr || !(mergedPr as any).merged_at || !(mergedPr as any).merge_commit_sha) {
        return null;
      }

      return {
        repo: standard.repo,
        prNumber: mergedPr.number,
        mergeCommitSha: (mergedPr as any).merge_commit_sha,
        mergedAt: (mergedPr as any).merged_at,
        source: "poll"
      };
    }

    return null;
  }

  computeEvidenceHash(evidence: GitHubMergeEvidence): Hex {
    const canonical = JSON.stringify({
      repo: evidence.repo,
      prNumber: evidence.prNumber,
      mergeCommitSha: evidence.mergeCommitSha,
      mergedAt: evidence.mergedAt,
      source: evidence.source
    });

    return keccak256(encodePacked(["string"], [canonical]));
  }
}
