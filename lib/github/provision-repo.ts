/**
 * Provisions a private GitHub repo for a candidate by copying the template repo.
 * Uses a PAT (Personal Access Token) for demo scale — migrate to GitHub App later.
 *
 * Strategy: NOT a fork (forks can be made public by owner). Instead we:
 *   1. Create a new empty private repo under the org
 *   2. Push the template contents into it via the Git Data API
 */

interface ProvisionRepoResult {
  repoName: string
  repoUrl: string
  cloneUrl: string
}

export async function provisionRepo(
  candidateId: string,
  attemptId: string,
): Promise<ProvisionRepoResult> {
  const org = process.env.GITHUB_ORG!
  const template = process.env.BROKEN_REPO_TEMPLATE!
  const token = process.env.GITHUB_PAT!

  const repoName = `exam-${candidateId.slice(0, 8)}-${Date.now()}`

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  }

  // Step 1: Create private repo under the authenticated user's account
  const createRes = await fetch(`https://api.github.com/user/repos`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: repoName,
      private: true,
      auto_init: false,
      description: `Exam session ${attemptId}`,
    }),
  })

  if (!createRes.ok) {
    const err = await createRes.text()
    throw new Error(`Failed to create repo: ${err}`)
  }

  const repo = await createRes.json()

  // Step 2: Get default branch SHA from template
  const templateRef = await fetch(
    `https://api.github.com/repos/${org}/${template}/git/refs/heads/master`,
    { headers },
  )

  if (!templateRef.ok) {
    throw new Error(`Failed to read template ref: ${await templateRef.text()}`)
  }

  const { object: { sha: templateSha } } = await templateRef.json()

  // Step 3: Get tree from template
  const treeRes = await fetch(
    `https://api.github.com/repos/${org}/${template}/git/commits/${templateSha}`,
    { headers },
  )
  const { tree: { sha: treeSha } } = await treeRes.json()

  // Step 4: Create initial commit in new repo pointing to template tree
  // First create a ref for default branch
  const initCommitRes = await fetch(
    `https://api.github.com/repos/${org}/${repoName}/git/commits`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: 'chore: initialize exam environment',
        tree: treeSha,
        parents: [],
      }),
    },
  )

  if (!initCommitRes.ok) {
    throw new Error(`Failed to create commit: ${await initCommitRes.text()}`)
  }

  const { sha: newCommitSha } = await initCommitRes.json()

  // Step 5: Create main branch ref
  const refRes = await fetch(
    `https://api.github.com/repos/${org}/${repoName}/git/refs`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ref: 'refs/heads/main',
        sha: newCommitSha,
      }),
    },
  )

  if (!refRes.ok) {
    throw new Error(`Failed to create ref: ${await refRes.text()}`)
  }

  return {
    repoName,
    repoUrl: repo.html_url,
    cloneUrl: repo.clone_url,
  }
}
