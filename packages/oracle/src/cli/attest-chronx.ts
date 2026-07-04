#!/usr/bin/env node
import { execSync } from "child_process";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import {
  type GitHubPullRequest,
  findEarliestQualifyingMerge,
  generateAttestationRecord
} from "../chronx-attestor.js";

async function getGitHubToken(): Promise<string> {
  // Use git credential fill to obtain GitHub token headlessly
  // Token is NEVER echoed, logged, or written — used only in API headers
  const input = "protocol=https\nhost=github.com\n\n";

  try {
    const output = execSync("git credential fill", {
      input,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"]
    });

    const lines = output.split("\n");
    for (const line of lines) {
      if (line.startsWith("password=")) {
        return line.substring("password=".length);
      }
    }

    throw new Error("No password found in git credential output");
  } catch (error) {
    throw new Error(`Failed to obtain GitHub token via git credential: ${error}`);
  }
}

async function queryGitHubMerges(
  token: string,
  repo: string,
  deadline: Date
): Promise<GitHubPullRequest[]> {
  const [owner, repoName] = repo.split("/");

  // Query GitHub REST API for merged pull requests
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repoName}/pulls?state=closed&sort=updated&direction=desc&per_page=100`,
    {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "ColdCash-Oracle-ChronX"
      }
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  const pulls = await response.json();
  return pulls as GitHubPullRequest[];
}

function parseArgs(): { grantId: string; repo: string; deadline: Date } {
  const args = process.argv.slice(2);

  let grantId: string | undefined;
  let repo: string | undefined;
  let deadline: Date | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--grant-id" && i + 1 < args.length) {
      grantId = args[i + 1];
      i++;
    } else if (args[i] === "--repo" && i + 1 < args.length) {
      repo = args[i + 1];
      i++;
    } else if (args[i] === "--deadline" && i + 1 < args.length) {
      deadline = new Date(args[i + 1]);
      i++;
    }
  }

  if (!grantId || !repo || !deadline || isNaN(deadline.getTime())) {
    console.error("Usage: pnpm --filter @coldcash/oracle attest-chronx -- --grant-id <id> --repo <owner/repo> --deadline <iso8601>");
    console.error("Example: pnpm --filter @coldcash/oracle attest-chronx -- --grant-id grant-123 --repo Counselco/coldcash-anchor-test --deadline 2026-07-04T12:00:00Z");
    process.exit(1);
  }

  return { grantId, repo, deadline };
}

async function main() {
  const { grantId, repo, deadline } = parseArgs();

  // Obtain GitHub token headlessly
  const token = await getGitHubToken();

  // Query GitHub API for merged PRs
  const pulls = await queryGitHubMerges(token, repo, deadline);

  // Find earliest qualifying merge
  const earliestMerge = findEarliestQualifyingMerge(pulls, deadline);

  // Generate attestation record
  const record = generateAttestationRecord(grantId, repo, earliestMerge);

  if (!earliestMerge) {
    console.log(`No qualifying merge found for ${repo} before ${deadline.toISOString()}`);
    console.log("Null window attestation (fail-closed)");
  } else {
    console.log(`Qualifying merge found: PR #${earliestMerge.number} merged at ${earliestMerge.merged_at}`);
    console.log(`Evidence hash: ${record.evidence_hash}`);
  }

  // Write to stdout
  console.log("\nAttestation Record:");
  console.log(JSON.stringify(record, null, 2));

  // Write to file
  const outDir = join(process.cwd(), "out", "attestations");
  mkdirSync(outDir, { recursive: true });

  const outPath = join(outDir, `${grantId}-w1.json`);
  writeFileSync(outPath, JSON.stringify(record, null, 2) + "\n");

  console.log(`\nAttestation written to: ${outPath}`);
}

main().catch(error => {
  console.error("Error:", error.message);
  process.exit(1);
});
