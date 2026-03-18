/**
 * Creates a GitHub Codespace for the candidate's exam repo.
 *
 * Split into two functions so the slow Codespace startup doesn't block a
 * Vercel serverless function:
 *   1. createCodespace  — fast POST only, returns immediately while Codespace provisions
 *   2. injectCodespaceSecrets — called from the session-status polling route once
 *      the Codespace reaches Available state (~60-90s after creation)
 */

import nacl from 'tweetnacl'
import { blake2b } from '@noble/hashes/blake2.js'

export interface CreateCodespaceResult {
  codespaceName: string
  codespaceUrl: string
}

export async function createCodespace(
  org: string,
  repoName: string,
  defaultBranch: string,
): Promise<CreateCodespaceResult> {
  const token = process.env.GITHUB_PAT!

  const res = await fetch(
    `https://api.github.com/repos/${org}/${repoName}/codespaces`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: defaultBranch,
        devcontainer_path: '.devcontainer/devcontainer.json',
      }),
    },
  )

  if (!res.ok) {
    throw new Error(`Failed to create Codespace: ${await res.text()}`)
  }

  const codespace = await res.json()
  return {
    codespaceName: codespace.name,
    codespaceUrl: codespace.web_url,
  }
}

/**
 * Checks whether the Codespace is Available, and if so injects the three
 * required secrets. Returns true if secrets were injected, false if the
 * Codespace is not yet Available (caller should retry on next poll).
 */
export async function injectCodespaceSecrets(
  codespaceName: string,
  sessionId: string,
): Promise<boolean> {
  const token = process.env.GITHUB_PAT!
  const apiKey = process.env.ANTHROPIC_API_KEY!
  const baseUrl = process.env.EXAM_ENVIRONMENT_BASE_URL!

  // Check current Codespace state
  const stateRes = await fetch(
    `https://api.github.com/user/codespaces/${codespaceName}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  )

  if (!stateRes.ok) return false

  const { state } = await stateRes.json()
  if (state !== 'Available') return false

  // Codespace is ready — inject secrets
  // SUBMIT_ENDPOINT is just the base URL; the hook in .claude/settings.json appends the path
  await setCodespaceSecret('ANTHROPIC_API_KEY', apiKey, token)
  await setCodespaceSecret('EXAM_SESSION_ID', sessionId, token)
  await setCodespaceSecret('SUBMIT_ENDPOINT', baseUrl, token)

  return true
}

async function setCodespaceSecret(
  secretName: string,
  secretValue: string,
  token: string,
): Promise<void> {
  const keyRes = await fetch(
    `https://api.github.com/user/codespaces/secrets/public-key`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  )

  if (!keyRes.ok) {
    throw new Error(`Could not fetch public key for secret ${secretName}: ${await keyRes.text()}`)
  }

  const { key, key_id } = await keyRes.json()
  const encryptedValue = encryptSecret(secretValue, key)

  const setRes = await fetch(
    `https://api.github.com/user/codespaces/secrets/${secretName}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ encrypted_value: encryptedValue, key_id }),
    },
  )

  if (!setRes.ok) {
    throw new Error(`Failed to set secret ${secretName}: ${await setRes.text()}`)
  }
}

/**
 * Encrypts a secret using libsodium's crypto_box_seal algorithm.
 * Output format: ephemeral_public_key (32 bytes) || ciphertext
 * Nonce is derived as blake2b(ephemeral_pk || recipient_pk)[0:24]
 */
function encryptSecret(value: string, publicKeyB64: string): string {
  const recipientPublicKey = new Uint8Array(Buffer.from(publicKeyB64, 'base64'))
  const message = new Uint8Array(Buffer.from(value))

  const ephemeral = nacl.box.keyPair()

  const noncePreimage = new Uint8Array(64)
  noncePreimage.set(ephemeral.publicKey, 0)
  noncePreimage.set(recipientPublicKey, 32)
  const nonce = blake2b(noncePreimage, { dkLen: 32 }).slice(0, 24)

  const ciphertext = nacl.box(message, nonce, recipientPublicKey, ephemeral.secretKey)

  const sealed = new Uint8Array(32 + ciphertext.length)
  sealed.set(ephemeral.publicKey, 0)
  sealed.set(ciphertext, 32)

  return Buffer.from(sealed).toString('base64')
}
