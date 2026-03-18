/**
 * Provisions a private GitHub repo for a candidate from the exam template.
 * Uses GitHub's "Generate from template" API — single call, copies all content.
 * Uses a PAT (Personal Access Token) for demo scale — migrate to GitHub App later.
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

  return {
    repoName: repo.name,
    repoUrl: repo.html_url,
    cloneUrl: repo.clone_url,
  }
}
