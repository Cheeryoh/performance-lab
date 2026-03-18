/**
 * Destroys a candidate's Codespace and private repo after session expiry.
 * Called by the cleanup cron or on manual admin action.
 */

export async function destroyEnv(
  codespaceName: string | null,
  repoName: string,
): Promise<{ codespaceDeleted: boolean; repoDeleted: boolean; errors: string[] }> {
  const org = process.env.GITHUB_ORG!
  const token = process.env.GITHUB_PAT!

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  const errors: string[] = []
  let codespaceDeleted = false
  let repoDeleted = false

  // Delete Codespace first (repo deletion while Codespace exists can leave orphaned Codespaces)
  if (codespaceName) {
    const res = await fetch(
      `https://api.github.com/user/codespaces/${codespaceName}`,
      { method: 'DELETE', headers },
    )
    if (res.ok || res.status === 404) {
      codespaceDeleted = true
    } else {
      errors.push(`Codespace delete failed (${res.status}): ${await res.text()}`)
    }
  }

  // Delete repo
  const repoRes = await fetch(
    `https://api.github.com/repos/${org}/${repoName}`,
    { method: 'DELETE', headers },
  )
  if (repoRes.ok || repoRes.status === 404) {
    repoDeleted = true
  } else {
    errors.push(`Repo delete failed (${repoRes.status}): ${await repoRes.text()}`)
  }

  return { codespaceDeleted, repoDeleted, errors }
}
