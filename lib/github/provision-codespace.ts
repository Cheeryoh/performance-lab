/**
 * Creates a GitHub Codespace for the candidate's exam repo.
 * Injects required secrets: ANTHROPIC_API_KEY, EXAM_SESSION_ID, SUBMIT_ENDPOINT.
 */

import nacl from 'tweetnacl'
import { blake2b } from '@noble/hashes/blake2.js'

interface ProvisionCodespaceResult {
  codespaceName: string
  codespaceUrl: string
}

export async function provisionCodespace(
  org: string,
  repoName: string,
  sessionId: string,
  defaultBranch: string,
): Promise<ProvisionCodespaceResult> {
  const token = process.env.GITHUB_PAT!
  const apiKey = process.env.ANTHROPIC_API_KEY!
  const baseUrl = process.env.EXAM_ENVIRONMENT_BASE_URL!

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  }

  // Create Codespace — omit machine to let GitHub pick the default for the account
  const createRes = await fetch(
    `https://api.github.com/repos/${org}/${repoName}/codespaces`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ref: defaultBranch,
        devcontainer_path: '.devcontainer/devcontainer.json',
      }),
    },
  )

  if (!createRes.ok) {
    throw new Error(`Failed to create Codespace: ${await createRes.text()}`)
  }

  const codespace = await createRes.json()
  const codespaceName: string = codespace.name

  // Wait for Codespace to reach Available state before injecting secrets
  // (secrets API returns 404 while Codespace is still Provisioning)
  await waitForCodespace(codespaceName, token)

  // Inject secrets — SUBMIT_ENDPOINT is just the base URL; the hook appends the path
  await setCodespaceSecret(codespaceName, 'ANTHROPIC_API_KEY', apiKey, token)
  await setCodespaceSecret(codespaceName, 'EXAM_SESSION_ID', sessionId, token)
  await setCodespaceSecret(codespaceName, 'SUBMIT_ENDPOINT', baseUrl, token)

  return {
    codespaceName,
    codespaceUrl: codespace.web_url,
  }
}

async function waitForCodespace(
  codespaceName: string,
  token: string,
  maxAttempts = 24,
  intervalMs = 10000,
): Promise<void> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(
      `https://api.github.com/user/codespaces/${codespaceName}`,
      { headers },
    )
    if (res.ok) {
      const { state } = await res.json()
      if (state === 'Available') return
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error(
    `Codespace ${codespaceName} never reached Available state after ${(maxAttempts * intervalMs) / 1000}s`,
  )
}

async function setCodespaceSecret(
  codespaceName: string,
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
    console.warn(`Could not fetch public key for secret ${secretName}: ${await keyRes.text()}`)
    return
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

  // Generate ephemeral keypair
  const ephemeral = nacl.box.keyPair()

  // Derive nonce: blake2b(ephemeral_pk || recipient_pk)[0:24]
  const noncePreimage = new Uint8Array(64)
  noncePreimage.set(ephemeral.publicKey, 0)
  noncePreimage.set(recipientPublicKey, 32)
  const nonce = blake2b(noncePreimage, { dkLen: 32 }).slice(0, 24)

  // Encrypt
  const ciphertext = nacl.box(message, nonce, recipientPublicKey, ephemeral.secretKey)

  // sealed = ephemeral_pk (32) || ciphertext
  const sealed = new Uint8Array(32 + ciphertext.length)
  sealed.set(ephemeral.publicKey, 0)
  sealed.set(ciphertext, 32)

  return Buffer.from(sealed).toString('base64')
}
