/**
 * Deterministic validation: replicates the 7 checks in exam-template/tests/validate.js
 * by reading repo files directly via the GitHub API.
 *
 * No git clone, no npm install, no exec — works reliably in Vercel serverless.
 * Reads: package.json, index.html, scss/_global.scss, scss/_bootstrap-overrides.scss
 */

export interface DeterministicResult {
  taskCode: string
  passed: boolean
  output: string
}

export async function runDeterministicChecks(
  repoName: string,
): Promise<DeterministicResult[]> {
  const org = process.env.GITHUB_ORG!
  const token = process.env.GITHUB_PAT!

  // Fetch the repo's default branch
  const repoMeta = await ghFetch(`/repos/${org}/${repoName}`, token)
  const branch: string = repoMeta.default_branch

  const [pkg, indexHtml, globalScss, overridesScss] = await Promise.all([
    ghFileContent(`/repos/${org}/${repoName}/contents/package.json?ref=${branch}`, token),
    ghFileContent(`/repos/${org}/${repoName}/contents/index.html?ref=${branch}`, token),
    ghFileContent(`/repos/${org}/${repoName}/contents/scss/_global.scss?ref=${branch}`, token),
    ghFileContent(`/repos/${org}/${repoName}/contents/scss/_bootstrap-overrides.scss?ref=${branch}`, token),
  ])

  const parsedPkg = JSON.parse(pkg)
  const jqueryVersion: string = parsedPkg.dependencies?.jquery ?? ''

  // Check vendor jQuery file if it exists
  let vendorJqueryContent = ''
  try {
    vendorJqueryContent = await ghFileContent(
      `/repos/${org}/${repoName}/contents/vendor/jquery/jquery.min.js?ref=${branch}`,
      token,
    )
  } catch {
    // File not committed — treat as old version still present
    vendorJqueryContent = 'jQuery v3.4.1'
  }

  const results: DeterministicResult[] = []

  // ── Task 1: Dependency Security ──────────────────────────────────────────
  const task1Checks = [
    {
      name: 'jQuery version in package.json is not 3.4.1 (CVE-2019-11358)',
      passed: jqueryVersion !== '3.4.1' && jqueryVersion !== '',
    },
    {
      name: 'Vendor jQuery file is updated (does not ship jQuery 3.4.1)',
      passed: !vendorJqueryContent.includes('jQuery v3.4.1'),
    },
  ]
  const task1Passed = task1Checks.every((c) => c.passed)
  results.push({
    taskCode: 'TASK-01',
    passed: task1Passed,
    output: task1Checks.map((c) => `${c.passed ? '✓' : '✗'} ${c.name}`).join('\n'),
  })

  // ── Task 2: Dead Analytics Tag ────────────────────────────────────────────
  const task2Passed = !indexHtml.includes('UA-')
  results.push({
    taskCode: 'TASK-02',
    passed: task2Passed,
    output: task2Passed
      ? '✓ index.html has no dead UA- Google Analytics tag'
      : '✗ index.html still contains a UA- Google Analytics tag',
  })

  // ── Task 3: Brand Color Consistency ──────────────────────────────────────
  const task3Checks = [
    {
      name: 'scss/_global.scss uses $primary, not a hardcoded #BD5D38',
      passed: !globalScss.toLowerCase().includes('#bd5d38'),
    },
    {
      name: 'scss/_bootstrap-overrides.scss uses $primary, not a hardcoded #BD5D38',
      passed: !overridesScss.toLowerCase().includes('#bd5d38'),
    },
    {
      name: '.img-profile element has no inline style with hardcoded brand color',
      passed: !(/img-profile[^>]*style=[^>]*#[Bb][Dd]5[Dd]38/.test(indexHtml)),
    },
    {
      name: '.skill-badge element has no inline style with hardcoded brand color',
      passed: !(/skill-badge[^>]*style=[^>]*#[Bb][Dd]5[Dd]38/.test(indexHtml)),
    },
  ]
  const task3Passed = task3Checks.every((c) => c.passed)
  results.push({
    taskCode: 'TASK-03',
    passed: task3Passed,
    output: task3Checks.map((c) => `${c.passed ? '✓' : '✗'} ${c.name}`).join('\n'),
  })

  return results
}

async function ghFileContent(path: string, token: string): Promise<string> {
  const data = await ghFetch(path, token)
  return Buffer.from(data.content, data.encoding ?? 'base64').toString('utf8')
}

async function ghFetch(path: string, token: string) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!res.ok) {
    throw new Error(`GitHub API ${path} returned ${res.status}: ${await res.text()}`)
  }
  return res.json()
}
