/**
 * Provisions a private GitHub repo for a candidate from the exam template.
 * Uses GitHub's "Generate from template" API — single call, copies all content.
 * Requires the template repo to be marked as a "Template repository" in GitHub settings.
 */

export interface ProvisionRepoResult {
  repoName: string
  repoUrl: string
  cloneUrl: string
  defaultBranch: string
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

  // Get the template's actual default branch — the generate response reports
  // GitHub's new-repo default ('main') regardless of what branch the template uses
  const templateRes = await fetch(
    `https://api.github.com/repos/${org}/${template}`,
    { headers },
  )
  if (!templateRes.ok) {
    throw new Error(`Failed to read template repo: ${await templateRes.text()}`)
  }
  const { default_branch: templateDefaultBranch } = await templateRes.json()

  const res = await fetch(
    `https://api.github.com/repos/${org}/${template}/generate`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        owner: org,
        name: repoName,
        private: true,
        description: `Exam session ${attemptId}`,
      }),
    },
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Failed to generate repo from template: ${err}`)
  }

  const repo = await res.json()

  // generate is async — poll until the template branch is committed before returning
  await waitForBranch(repo.full_name, templateDefaultBranch, headers)

  return {
    repoName: repo.name,
    repoUrl: repo.html_url,
    cloneUrl: repo.clone_url,
    defaultBranch: templateDefaultBranch,
  }
}

async function waitForBranch(
  fullRepoName: string,
  branch: string,
  headers: Record<string, string>,
  maxAttempts = 12,
  intervalMs = 5000,
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(
      `https://api.github.com/repos/${fullRepoName}/branches`,
      { headers },
    )
    if (res.ok) {
      const branches = await res.json() as Array<{ name: string }>
      if (branches.some((b) => b.name === branch)) return
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error(`Branch ${branch} never appeared in ${fullRepoName} after ${maxAttempts * intervalMs / 1000}s`)
}
