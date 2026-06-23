// ============================================================================
// Credential encryption — AES-256-GCM authenticated encryption.
// ----------------------------------------------------------------------------
// CLAUDE.md Rule 3: secrets are encrypted at rest. The key lives ONLY in
// CREDENTIAL_ENCRYPTION_KEY (env, 32 bytes hex). A fresh random 96-bit nonce is
// generated per encryption (never reuse a nonce with GCM). The stored format is:
//
//     v1:<base64( nonce[12] || authTag[16] || ciphertext )>
//
// GCM's auth tag means tampering with the ciphertext fails decryption loudly.
// NEVER log plaintext or the key.
// ============================================================================
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = 'v1';

function getKey(): Buffer {
  const hex = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY is not set');
  }
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) {
    throw new Error(
      `CREDENTIAL_ENCRYPTION_KEY must be 32 bytes (64 hex chars); got ${key.length} bytes`,
    );
  }
  return key;
}

/** Encrypt a plaintext credential. Returns the packed "v1:<base64>" string. */
export function encryptCredential(plaintext: string): string {
  const key = getKey();
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([nonce, tag, ciphertext]).toString('base64');
  return `${VERSION}:${packed}`;
}

/** Decrypt a "v1:<base64>" string back to plaintext. Throws on tamper/format. */
export function decryptCredential(stored: string): string {
  const key = getKey();
  const [version, packed] = stored.split(':', 2);
  if (version !== VERSION || !packed) {
    throw new Error('Malformed encrypted credential (bad version/format)');
  }
  const buf = Buffer.from(packed, 'base64');
  const nonce = buf.subarray(0, NONCE_BYTES);
  const tag = buf.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES);
  const ciphertext = buf.subarray(NONCE_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, nonce);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

/** Mask a secret for display — show only the last 4 characters. */
export function maskSecret(plaintext: string): string {
  if (plaintext.length <= 4) return '••••';
  return `••••${plaintext.slice(-4)}`;
}
