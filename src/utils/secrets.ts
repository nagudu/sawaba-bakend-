import crypto from 'node:crypto'

/**
 * At-rest encryption for provider credentials (SMS API key, WhatsApp token,
 * email API key / SMTP password) stored in the `notification_settings` row.
 *
 * Ciphertext is tagged with an `enc:v1:` prefix so plaintext values written
 * before encryption existed (or by an older deploy) keep working — decryption
 * returns them unchanged. New values are always encrypted when a key is set.
 *
 *   ENCRYPTION_KEY — 64-char hex (32 bytes) or any passphrase (derived with
 *                    scrypt). When unset the module degrades to plaintext and
 *                    warns once; production should always set it.
 */

const PREFIX = 'enc:v1:'
const SCRYPT_SALT = 'sawaba-notification-secrets-v1'

function getKey(): Buffer | null {
  const raw = (process.env.ENCRYPTION_KEY ?? '').trim()
  if (!raw) return null
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex')
  return crypto.scryptSync(raw, SCRYPT_SALT, 32)
}

/** True when an encryption key is configured (secrets are encrypted at rest). */
export function isEncryptionConfigured(): boolean {
  return getKey() !== null
}

let warned = false
function warnPlaintextOnce(): void {
  if (warned) return
  warned = true
  console.warn(
    '[secrets] ENCRYPTION_KEY is not set — provider credentials will be stored UNENCRYPTED. ' +
      'Set ENCRYPTION_KEY (64-char hex or a passphrase) in production.',
  )
}

/** Encrypts a secret for storage. Returns the input unchanged when no key is set. */
export function encryptSecret(plain: string): string {
  const key = getKey()
  if (!key) {
    warnPlaintextOnce()
    return plain
  }
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`
}

/**
 * Decrypts a stored secret. Returns the value unchanged when it is not
 * `enc:v1:`-prefixed (legacy plaintext), and null on any decryption failure
 * (e.g. a rotated key) so callers never see garbage.
 */
export function decryptSecret(value: string | null | undefined): string | null {
  if (!value) return null
  if (!value.startsWith(PREFIX)) return value
  const key = getKey()
  if (!key) return null
  const parts = value.slice(PREFIX.length).split(':')
  if (parts.length !== 3) return null
  const [ivB64, tagB64, dataB64] = parts
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ])
    return decrypted.toString('utf8')
  } catch {
    console.error('[secrets] failed to decrypt a stored secret (wrong ENCRYPTION_KEY?)')
    return null
  }
}

/** True when the given stored value is an encrypted envelope. */
export function isEncrypted(value: string | null | undefined): boolean {
  return Boolean(value && value.startsWith(PREFIX))
}

/** Non-reversible view of a stored secret for the admin API. */
export function secretState(value: string | null | undefined): { set: boolean; last4: string | null } {
  const plain = decryptSecret(value)
  if (!plain) return { set: false, last4: null }
  return { set: true, last4: plain.slice(-4) }
}
