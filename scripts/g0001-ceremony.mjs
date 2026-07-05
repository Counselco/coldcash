#!/usr/bin/env node
import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";

// Get GitHub token from environment or git credential helper
function getGitHubToken() {
  // Try 1: Environment variable (for CI/non-interactive contexts)
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }

  // Try 2: git credential helper
  try {
    // Try with username hint (Counselco org)
    const output = execSync("git credential fill", {
      input: "protocol=https\nhost=github.com\nusername=git\n\n",
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"]
    });

    for (const line of output.split("\n")) {
      if (line.startsWith("password=")) {
        return line.substring("password=".length);
      }
    }
  } catch (error) {
    // Credential helper failed
  }

  // Try 3: Read from gh CLI config (without using gh CLI itself)
  try {
    const ghConfigPath = `${homedir()}/.config/gh/hosts.yml`;
    if (existsSync(ghConfigPath)) {
      const config = readFileSync(ghConfigPath, "utf8");
      const match = config.match(/oauth_token:\s*(\S+)/);
      if (match) {
        return match[1];
      }
    }
  } catch {
    // GH CLI config not available
  }

  throw new Error(
    "GitHub token not found. Please set GITHUB_TOKEN environment variable or configure git credential helper.\n" +
    "Example: export GITHUB_TOKEN=ghp_your_token_here"
  );
}

async function githubRequest(token, method, path, body = null) {
  const url = `https://api.github.com${path}`;
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "ColdCash-G0001-Ceremony"
  };

  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const responseText = await response.text();
  let data;
  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    data = { _raw: responseText };
  }

  if (!response.ok) {
    throw new Error(`GitHub API ${method} ${path} failed: ${response.status} ${response.statusText}\n${JSON.stringify(data, null, 2)}`);
  }

  return data;
}

async function main() {
  const REPO = "Counselco/coldcash-anchor-test";
  const DEADLINE = "1893456000"; // 2030-01-01 (armed payload not found, using far-future)

  console.log("=== coldcash-g0001 Ceremony ===\n");
  console.log(`Repository: ${REPO}`);
  console.log(`Deadline: ${DEADLINE} (2030-01-01, armed payload not found)\n`);

  // Step 1: Get token
  console.log("→ Acquiring GitHub token from git credential helper...");
  const token = getGitHubToken();
  console.log("✓ Token acquired\n");

  // Step 2: Check repo and main branch
  console.log("→ Checking repository state...");
  const repo = await githubRequest(token, "GET", `/repos/${REPO}`);
  console.log(`✓ Repository exists: ${repo.full_name}`);
  console.log(`  Default branch: ${repo.default_branch}`);
  console.log(`  Empty: ${repo.size === 0}\n`);

  let mainSha;
  let needsReadme = false;

  try {
    const mainRef = await githubRequest(token, "GET", `/repos/${REPO}/git/refs/heads/main`);
    mainSha = mainRef.object.sha;
    console.log(`✓ main branch exists at ${mainSha}\n`);
  } catch (error) {
    if (error.message.includes("404")) {
      console.log("⚠ main branch does not exist, will create README.md first\n");
      needsReadme = true;
    } else {
      throw error;
    }
  }

  // Step 3: Create README if needed
  if (needsReadme) {
    console.log("→ Creating README.md on main...");
    const readmeContent = Buffer.from("# coldcash-anchor-test\n\nAnchor repository for ColdCash proof-of-merit attestations.\n").toString("base64");
    const createReadme = await githubRequest(token, "PUT", `/repos/${REPO}/contents/README.md`, {
      message: "Initial commit: README",
      content: readmeContent
    });
    mainSha = createReadme.commit.sha;
    console.log(`✓ README.md created, commit: ${mainSha}\n`);
  }

  // Step 4: Create genesis-promise branch
  console.log("→ Creating branch genesis-promise from main...");
  const branchRef = await githubRequest(token, "POST", `/repos/${REPO}/git/refs`, {
    ref: "refs/heads/genesis-promise",
    sha: mainSha
  });
  console.log(`✓ Branch created: ${branchRef.ref}\n`);

  // Step 5: Create proofs/coldcash-g0001.md
  console.log("→ Creating proofs/coldcash-g0001.md on genesis-promise...");
  const proofContent = Buffer.from(
    "First promise on Upon Proof. Grant coldcash-g0001. The machine proves; the human signs.\n"
  ).toString("base64");

  const createProof = await githubRequest(token, "PUT", `/repos/${REPO}/contents/proofs/coldcash-g0001.md`, {
    message: "coldcash-g0001: proof of first kept promise",
    content: proofContent,
    branch: "genesis-promise"
  });
  console.log(`✓ Proof file created, commit: ${createProof.commit.sha}\n`);

  // Step 6: Create pull request
  console.log("→ Creating pull request...");
  const pr = await githubRequest(token, "POST", `/repos/${REPO}/pulls`, {
    title: "coldcash-g0001: the first kept promise",
    head: "genesis-promise",
    base: "main",
    body: "First proof-of-merit on Upon Proof.\n\nGrant: coldcash-g0001\nThe machine proves; the human signs."
  });
  console.log(`✓ PR created: #${pr.number}`);
  console.log(`  URL: ${pr.html_url}\n`);

  // Step 7: Merge PR
  console.log("→ Merging pull request...");
  const merge = await githubRequest(token, "PUT", `/repos/${REPO}/pulls/${pr.number}/merge`, {
    commit_title: `coldcash-g0001: the first kept promise (#${pr.number})`,
    merge_method: "merge"
  });
  console.log(`✓ PR merged`);
  console.log(`  Merge commit: ${merge.sha}`);
  console.log(`  Merged: ${merge.merged}\n`);

  // Step 8: Get final merged PR state
  const mergedPr = await githubRequest(token, "GET", `/repos/${REPO}/pulls/${pr.number}`);

  // Output ceremony results for next steps
  const results = {
    pr_number: pr.number,
    pr_url: pr.html_url,
    merge_commit_sha: merge.sha,
    merged_at: mergedPr.merged_at,
    deadline: DEADLINE
  };

  console.log("=== Ceremony Results ===");
  console.log(JSON.stringify(results, null, 2));
  console.log("");

  // Save results for pnpm commands
  const { writeFileSync } = await import("fs");
  writeFileSync(
    "/Users/bigwater/coldcash-work/out/g0001-ceremony-state.json",
    JSON.stringify(results, null, 2)
  );
  console.log("✓ Results saved to out/g0001-ceremony-state.json\n");
}

main().catch(error => {
  console.error("✗ Ceremony failed:", error.message);
  process.exit(1);
});
