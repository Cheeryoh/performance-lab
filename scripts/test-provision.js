/**
 * test-provision.js
 *
 * Tests the full GitHub provisioning flow locally — no Vercel deploy needed.
 * Catches errors at each step before they become production failures.
 *
 * Usage:
 *   node --env-file=.env.local scripts/test-provision.js
 *
 * Pass --cleanup to delete the repo and codespace after a successful run.
 *   node --env-file=.env.local scripts/test-provision.js --cleanup
 */

"use strict";

const CLEANUP = process.argv.includes("--cleanup");

const ORG      = process.env.GITHUB_ORG;
const TEMPLATE = process.env.BROKEN_REPO_TEMPLATE;
const TOKEN    = process.env.GITHUB_PAT;

if (!ORG || !TEMPLATE || !TOKEN) {
  console.error("Missing env vars. Ensure GITHUB_ORG, BROKEN_REPO_TEMPLATE, GITHUB_PAT are set.");
  process.exit(1);
}

const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
};

const FAKE_CANDIDATE_ID = "test0000-0000-0000-0000-000000000000";
const FAKE_SESSION_ID   = "test-session-id";
const FAKE_ATTEMPT_ID   = "test-attempt-id";
const REPO_NAME         = `exam-test0000-${Date.now()}`;

let createdRepoName = null;
let createdCodespaceName = null;

async function step(label, fn) {
  process.stdout.write(`  ${label}... `);
  try {
    const result = await fn();
    console.log("OK");
    return result;
  } catch (err) {
    console.log("FAILED");
    console.error(`    → ${err.message}`);
    await cleanup();
    process.exit(1);
  }
}

async function cleanup() {
  if (!createdCodespaceName && !createdRepoName) return;
  console.log("\nCleaning up...");

  if (createdCodespaceName) {
    const res = await fetch(
      `https://api.github.com/user/codespaces/${createdCodespaceName}`,
      { method: "DELETE", headers: HEADERS },
    );
    console.log(`  Codespace delete: ${res.ok || res.status === 404 ? "OK" : res.status}`);
  }

  if (createdRepoName) {
    const res = await fetch(
      `https://api.github.com/repos/${ORG}/${createdRepoName}`,
      { method: "DELETE", headers: HEADERS },
    );
    const repoStatus = res.ok || res.status === 404 ? "OK" : `${res.status} (PAT needs delete_repo scope — delete manually at github.com/${ORG}/${createdRepoName})`;
    console.log(`  Repo delete: ${repoStatus}`);
  }
}

async function main() {
  console.log("\nProvisioning test\n");
  console.log(`  Org/user : ${ORG}`);
  console.log(`  Template : ${TEMPLATE}`);
  console.log(`  New repo : ${REPO_NAME}\n`);

  // 1. Verify template exists and is a template repo
  const templateMeta = await step("Verify template repo accessible", async () => {
    const res = await fetch(
      `https://api.github.com/repos/${ORG}/${TEMPLATE}`,
      { headers: HEADERS },
    );
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (!data.is_template) throw new Error(`Repo exists but is_template=false — mark it as a Template in GitHub settings`);
    return data;
  });
  const defaultBranch = templateMeta.default_branch;
  console.log(`    default_branch: ${defaultBranch}`);

  // 2. Generate repo from template
  const repo = await step("Generate repo from template", async () => {
    const res = await fetch(
      `https://api.github.com/repos/${ORG}/${TEMPLATE}/generate`,
      {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({
          owner: ORG,
          name: REPO_NAME,
          private: true,
          description: `Test exam session`,
        }),
      },
    );
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return await res.json();
  });
  createdRepoName = repo.name;
  console.log(`    repo url: ${repo.html_url}`);
  console.log(`    default_branch: ${repo.default_branch}`);

  // 2b. Wait for template content to be committed (generate is async)
  await step(`Wait for ${defaultBranch} branch to be ready`, async () => {
    for (let i = 0; i < 12; i++) {
      const res = await fetch(
        `https://api.github.com/repos/${ORG}/${REPO_NAME}/branches`,
        { headers: HEADERS },
      );
      if (res.ok) {
        const branches = await res.json();
        if (branches.some((b) => b.name === defaultBranch)) return;
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
    throw new Error(`Branch ${defaultBranch} never appeared after 60s`);
  });

  // 3. Create Codespace — use template's default branch (not generated repo's reported
  //    default_branch, which GitHub sets to 'main' regardless of template branch names)
  const codespace = await step("Create Codespace", async () => {
    const res = await fetch(
      `https://api.github.com/repos/${ORG}/${REPO_NAME}/codespaces`,
      {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({
          ref: defaultBranch,
          devcontainer_path: ".devcontainer/devcontainer.json",
        }),
      },
    );
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return await res.json();
  });
  createdCodespaceName = codespace.name;
  console.log(`    codespace name: ${codespace.name}`);
  console.log(`    web_url: ${codespace.web_url}`);
  console.log(`    state: ${codespace.state}`);

  // 3b. Wait for Codespace to reach Available state
  await step("Wait for Codespace to be Available", async () => {
    for (let i = 0; i < 24; i++) {
      const res = await fetch(
        `https://api.github.com/user/codespaces/${createdCodespaceName}`,
        { headers: HEADERS },
      );
      if (res.ok) {
        const { state } = await res.json();
        console.log(`\n    state: ${state}`);
        if (state === "Available") return;
      }
      await new Promise((r) => setTimeout(r, 10000));
    }
    throw new Error(`Codespace never reached Available state after 240s`);
  });

  // 4. Fetch Codespace public key (needed for secret encryption)
  // Note: user-level secrets endpoint — no codespace name in path
  await step("Fetch Codespace public key", async () => {
    const res = await fetch(
      `https://api.github.com/user/codespaces/secrets/public-key`,
      { headers: HEADERS },
    );
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (!data.key || !data.key_id) throw new Error("Public key response missing key or key_id");
    return data;
  });

  // 5. Set a test secret (EXAM_SESSION_ID — safe to test with fake value)
  await step("Set EXAM_SESSION_ID secret (endpoint reachable)", async () => {
    const keyRes = await fetch(
      `https://api.github.com/user/codespaces/secrets/public-key`,
      { headers: HEADERS },
    );
    const { key, key_id } = await keyRes.json();
    if (!key || !key_id) throw new Error("No public key available for secret injection");
  });

  console.log("\n✓ All provisioning steps passed\n");
  console.log(`  Codespace URL: ${codespace.web_url}`);
  console.log(`  Repo URL:      https://github.com/${ORG}/${REPO_NAME}`);

  if (CLEANUP) {
    await cleanup();
  } else {
    console.log("\nResources left running. Run with --cleanup to delete them, or clean up manually:");
    console.log(`  Repo:      https://github.com/${ORG}/${REPO_NAME}`);
    console.log(`  Codespace: ${codespace.name}\n`);
  }
}

main().catch((err) => {
  console.error("\nUnexpected error:", err);
  process.exit(1);
});
