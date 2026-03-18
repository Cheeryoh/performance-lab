/**
 * Deterministic validation: clone final repo state and run npm test.
 * Runs in a Vercel serverless function — uses the GitHub API to read files
 * rather than a full git clone (which requires the git binary).
 *
 * For demo: runs npm test via a lightweight exec approach.
 * Production path: use Vercel Fluid Compute or a dedicated runner.
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

const execAsync = promisify(exec)

const MAX_OUTPUT_CHARS = 10_000

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

  // Get the default branch SHA
  const ref = await ghFetch(`/repos/${org}/${repoName}/git/refs/heads/main`, token)
  const sha: string = ref.object.sha

  // Get the full tree
  const tree = await ghFetch(
    `/repos/${org}/${repoName}/git/trees/${sha}?recursive=1`,
    token,
  )

  // Write files to a temp directory
  const workDir = join(tmpdir(), `exam-check-${Date.now()}`)
  await mkdir(workDir, { recursive: true })

  try {
    await writeTreeToDir(workDir, tree.tree, org, repoName, token)

    // Install deps
    await execAsync('npm ci --prefer-offline', { cwd: workDir, timeout: 60_000 })

    // Run tests
    const { stdout, stderr } = await execAsync('npm test -- --ci --no-coverage', {
      cwd: workDir,
      timeout: 60_000,
    }).catch((err) => ({
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
    }))

    const output = (stdout + stderr).slice(0, MAX_OUTPUT_CHARS)
    const passed = !output.includes('FAIL') && !output.includes('failed') &&
      (output.includes('PASS') || output.includes('passed'))

    return [
      {
        taskCode: 'TASK-01',
        passed,
        output,
      },
    ]
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

async function writeTreeToDir(
  dir: string,
  tree: Array<{ path: string; type: string; sha: string }>,
  org: string,
  repo: string,
  token: string,
) {
  const blobs = tree.filter((item) => item.type === 'blob')

  await Promise.all(
    blobs.map(async (item) => {
      const filePath = join(dir, item.path)
      const fileDir = filePath.substring(0, filePath.lastIndexOf('/'))
      await mkdir(fileDir, { recursive: true })

      const blob = await ghFetch(`/repos/${org}/${repo}/git/blobs/${item.sha}`, token)
      const content = Buffer.from(blob.content, blob.encoding ?? 'base64')
      await writeFile(filePath, content)
    }),
  )
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
