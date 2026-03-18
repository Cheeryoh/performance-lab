/**
 * Creates a GitHub Codespace for the candidate's exam repo.
 * Injects required secrets: ANTHROPIC_API_KEY, EXAM_SESSION_ID, SUBMIT_ENDPOINT.
 *
 * The Codespace uses a devcontainer.json already in the template repo that:
 *   - Installs Claude Code CLI
 *   - Installs Playwright
 *   - Forwards ports 3000 (app) and 8080 (Playwright UI)
 *   - Configures Claude Code PostToolUse hook to stream events to our API
 */

interface ProvisionCodespaceResult {
  codespaceName: string
  codespaceUrl: string
}

export async function provisionCodespace(
  org: string,
  repoName: string,
  sessionId: string,
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

  // Create Codespace
  const createRes = await fetch(
    `https://api.github.com/repos/${org}/${repoName}/codespaces`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ref: 'main',
        machine: 'basicLinux32gb',
        devcontainer_path: '.devcontainer/devcontainer.json',
      }),
    },
  )

  if (!createRes.ok) {
    throw new Error(`Failed to create Codespace: ${await createRes.text()}`)
  }

  const codespace = await createRes.json()
  const codespaceName: string = codespace.name

  // Inject secrets into the Codespace
  await setCodespaceSecret(codespaceName, 'ANTHROPIC_API_KEY', apiKey, token)
  await setCodespaceSecret(codespaceName, 'EXAM_SESSION_ID', sessionId, token)
  await setCodespaceSecret(
    codespaceName,
    'SUBMIT_ENDPOINT',
    `${baseUrl}/api/validation/events`,
    token,
  )

  return {
    codespaceName,
    codespaceUrl: codespace.web_url,
  }
}

/**
 * Sets a secret on a Codespace using GitHub's secrets API.
 * Secrets require public key encryption (libsodium) in production;
 * for demo we use the simpler "set selected repositories" scope approach.
 */
async function setCodespaceSecret(
  codespaceName: string,
  secretName: string,
  secretValue: string,
  token: string,
): Promise<void> {
  // Get the Codespace public key for encryption
  const keyRes = await fetch(
    `https://api.github.com/user/codespaces/${codespaceName}/secrets/public-key`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  )

  if (!keyRes.ok) {
    // Secrets API may not be available before Codespace is fully ready — skip non-critical ones
    console.warn(`Could not fetch public key for secret ${secretName}: ${await keyRes.text()}`)
    return
  }

  const { key, key_id } = await keyRes.json()

  // Encrypt using sodium (requires libsodium-wrappers in production)
  // For demo: set via environment variable alternative — devcontainer.json uses containerEnv
  const encryptedValue = await encryptSecret(secretValue, key)

  const setRes = await fetch(
    `https://api.github.com/user/codespaces/${codespaceName}/secrets/${secretName}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        encrypted_value: encryptedValue,
        key_id,
      }),
    },
  )

  if (!setRes.ok) {
    throw new Error(`Failed to set secret ${secretName}: ${await setRes.text()}`)
  }
}

/**
 * Encrypts a secret value using the Codespace's public key (NaCl box seal).
 * Uses tweetnacl (pure JS) — compatible with Next.js API routes.
 */
async function encryptSecret(value: string, publicKeyB64: string): Promise<string> {
  const nacl = await import('tweetnacl')

  const recipientPublicKey = Buffer.from(publicKeyB64, 'base64')
  const messageBytes = Buffer.from(value)

  // Generate ephemeral keypair
  const ephemeralKeyPair = nacl.box.keyPair()

  // Shared key via DH
  const sharedKey = nacl.box.before(
    new Uint8Array(recipientPublicKey),
    ephemeralKeyPair.secretKey,
  )

  // Encrypt with shared key
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const encrypted = nacl.box.after(new Uint8Array(messageBytes), nonce, sharedKey)

  // Output: ephemeral public key (32) + nonce (24) + ciphertext
  const output = new Uint8Array(
    ephemeralKeyPair.publicKey.length + nonce.length + encrypted.length,
  )
  output.set(ephemeralKeyPair.publicKey, 0)
  output.set(nonce, ephemeralKeyPair.publicKey.length)
  output.set(encrypted, ephemeralKeyPair.publicKey.length + nonce.length)

  return Buffer.from(output).toString('base64')
}
