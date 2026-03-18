/**
 * Provisions a private GitHub repo for a candidate by copying the template repo.
 * Uses a PAT (Personal Access Token) for demo scale — migrate to GitHub App later.
 *
 * Strategy: NOT a fork (forks can be made public by owner). Instead we:
 *   1. Create a new private repo (auto_init=true so git DB is initialized)
 *   2. Copy the template tree into a new commit on top of the auto-init commit
 *   3. Force-update the default branch ref to the new commit
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

  // Step 1: Create private repo with auto_init so the git DB exists
  const createRes = await fetch(`https://api.github.com/user/repos`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: repoName,
      private: true,
      auto_init: true,
      description: `Exam session ${attemptId}`,
    }),
  })

  if (!createRes.ok) {
    const err = await createRes.text()
    throw new Error(`Failed to create repo: ${err}`)
  }

  const repo = await createRes.json()
  const defaultBranch: string = repo.default_branch // 'main' or 'master'

  // Step 2: Get HEAD SHA of the auto-init commit
  const headRefRes = await fetch(
    `https://api.github.com/repos/${repo.full_name}/git/refs/heads/${defaultBranch}`,
    { headers },
  )

  if (!headRefRes.ok) {
    throw new Error(`Failed to read new repo HEAD: ${await headRefRes.text()}`)
  }

  const { object: { sha: headSha } } = await headRefRes.json()

  // Step 3: Get template branch SHA
  const templateRefRes = await fetch(
    `https://api.github.com/repos/${org}/${template}/git/refs/heads/master`,
    { headers },
  )

  if (!templateRefRes.ok) {
    throw new Error(`Failed to read template ref: ${await templateRefRes.text()}`)
  }

  const { object: { sha: templateCommitSha } } = await templateRefRes.json()

  // Step 4: Get tree SHA from template commit
  const treeRes = await fetch(
    `https://api.github.com/repos/${org}/${template}/git/commits/${templateCommitSha}`,
    { headers },
  )

  if (!treeRes.ok) {
    throw new Error(`Failed to read template tree: ${await treeRes.text()}`)
  }

  const { tree: { sha: treeSha } } = await treeRes.json()

  // Step 5: Create exam content commit on top of the auto-init commit
  const commitRes = await fetch(
    `https://api.github.com/repos/${repo.full_name}/git/commits`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: 'chore: initialize exam environment',
        tree: treeSha,
        parents: [headSha],
      }),
    },
  )

  if (!commitRes.ok) {
    throw new Error(`Failed to create commit: ${await commitRes.text()}`)
  }

  const { sha: newCommitSha } = await commitRes.json()

  // Step 6: Force-update default branch to our new commit
  const refRes = await fetch(
    `https://api.github.com/repos/${repo.full_name}/git/refs/heads/${defaultBranch}`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ sha: newCommitSha, force: true }),
    },
  )

  if (!refRes.ok) {
    throw new Error(`Failed to update ref: ${await refRes.text()}`)
  }

  return {
    repoName,
    repoUrl: repo.html_url,
    cloneUrl: repo.clone_url,
  }
}
