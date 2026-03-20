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

  // Inject ANTHROPIC_API_KEY directly into devcontainer.json containerEnv.
  // This is the only reliable way to get it into the container at startup —
  // Codespace secrets are injected at start time only and have propagation delays.
  await injectApiKeyIntoDevcontainer(repo.full_name, templateDefaultBranch, headers)

  return {
    repoName: repo.name,
    repoUrl: repo.html_url,
    cloneUrl: repo.clone_url,
    defaultBranch: templateDefaultBranch,
  }
}

async function injectApiKeyIntoDevcontainer(
  fullRepoName: string,
  branch: string,
  headers: Record<string, string>,
): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY!
  const path = '.devcontainer/devcontainer.json'

  // Fetch current file content + SHA (required for update)
  const getRes = await fetch(
    `https://api.github.com/repos/${fullRepoName}/contents/${path}?ref=${branch}`,
    { headers },
  )
  if (!getRes.ok) {
    throw new Error(`Failed to fetch devcontainer.json: ${await getRes.text()}`)
  }
  const { content, sha } = await getRes.json()

  // Decode, parse, inject key, re-encode
  const devcontainer = JSON.parse(Buffer.from(content, 'base64').toString('utf8'))
  devcontainer.containerEnv = { ...(devcontainer.containerEnv ?? {}), ANTHROPIC_API_KEY: apiKey }
  const updated = Buffer.from(JSON.stringify(devcontainer, null, 2) + '\n').toString('base64')

  // Commit updated file
  const putRes = await fetch(
    `https://api.github.com/repos/${fullRepoName}/contents/${path}`,
    {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: 'chore: inject exam environment config',
        content: updated,
        sha,
        branch,
      }),
    },
  )
  if (!putRes.ok) {
    throw new Error(`Failed to update devcontainer.json: ${await putRes.text()}`)
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
