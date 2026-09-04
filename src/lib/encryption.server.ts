// Server-side AES-256-GCM encryption for sensitive user data.
// Uses Web Crypto API (native in Cloudflare Workers).
// Production encrypts sensitive data with a dedicated ENCRYPTION_KEY.

const AES_ALGORITHM = "AES-GCM";
const AES_KEY_LENGTH = 256; // bits; SHA-256 digest length matches exactly
const IV_LENGTH_BYTES = 12; // 96-bit IV for GCM

function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (key && key.length >= 32) {
    return key;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("ENCRYPTION_KEY must be set and at least 32 characters long in production");
  }

  const fallback = process.env.SESSION_SECRET;
  if (!fallback || fallback.length < 32) {
    throw new Error("SESSION_SECRET must be set and at least 32 characters long");
  }
  return fallback;
}

/**
 * Derive a 256-bit AES key from the configured secret.
 *
 * The secret is operator-supplied text of arbitrary length >= 32. AES-GCM
 * accepts only 128/192/256-bit keys, so the raw bytes cannot be used directly:
 * a 33-character key passed validation and then threw inside importKey. SHA-256
 * gives a fixed 256-bit key for any input length.
 *
 * This changes the derived key for secrets that are not exactly 32 bytes. Those
 * secrets could never encrypt anything before this fix, so no readable
 * ciphertext exists under them and there is nothing to migrate. A 32-byte
 * secret's derived key DOES change — see the migration note below.
 */
async function deriveAesKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  if (digest.byteLength * 8 !== AES_KEY_LENGTH) {
    throw new Error("Derived AES key length does not match AES_KEY_LENGTH");
  }
  return crypto.subtle.importKey("raw", digest, { name: AES_ALGORITHM }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * Legacy derivation: the secret's raw UTF-8 bytes used directly as the AES
 * key. Only valid for a secret of exactly 32 bytes. Retained so ciphertext
 * written before the SHA-256 derivation can still be read once, then rewritten.
 */
async function deriveLegacyAesKey(secret: string): Promise<CryptoKey | null> {
  const raw = new TextEncoder().encode(secret);
  if (raw.byteLength !== 32) return null;
  return crypto.subtle.importKey("raw", raw, { name: AES_ALGORITHM }, false, ["decrypt"]);
}

function encodeHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function decodeHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a hex string in the format: iv:ciphertext:authTag
 */
export async function encrypt(plaintext: string): Promise<string> {
  const secret = getEncryptionKey();
  const key = await deriveAesKey(secret);
  const iv = new Uint8Array(IV_LENGTH_BYTES);
  crypto.getRandomValues(iv);

  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(plaintext);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: AES_ALGORITHM, iv: iv.buffer as ArrayBuffer },
    key,
    plaintextBytes.buffer as ArrayBuffer,
  );

  const combined = new Uint8Array(ciphertextBuffer);
  const ciphertext = combined.slice(0, combined.length - 16);
  const authTag = combined.slice(combined.length - 16);

  return `${encodeHex(iv)}:${encodeHex(ciphertext)}:${encodeHex(authTag)}`;
}

/**
 * Decrypt a ciphertext string produced by encrypt().
 * Expects hex string in the format: iv:ciphertext:authTag
 */
export async function decrypt(ciphertext: string): Promise<string> {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format: expected iv:ciphertext:authTag");
  }

  const iv = decodeHex(parts[0]);
  const encrypted = decodeHex(parts[1]);
  const authTag = decodeHex(parts[2]);

  const secret = getEncryptionKey();
  const key = await deriveAesKey(secret);

  // Reconstruct the ciphertext + authTag into a single buffer for Web Crypto
  const combined = new Uint8Array(encrypted.length + authTag.length);
  combined.set(encrypted, 0);
  combined.set(authTag, encrypted.length);

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: AES_ALGORITHM, iv: iv.buffer as ArrayBuffer },
      key,
      combined.buffer as ArrayBuffer,
    );
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    // Ciphertext written before the SHA-256 derivation used the secret's raw
    // UTF-8 bytes as the AES key. Retry with that key when it is valid (a
    // 32-byte secret) so legacy rows stay readable; every new write uses the
    // new derivation, so this path drains over time.
    const legacyKey = await deriveLegacyAesKey(secret);
    if (legacyKey) {
      const decrypted = await crypto.subtle.decrypt(
        { name: AES_ALGORITHM, iv: iv.buffer as ArrayBuffer },
        legacyKey,
        combined.buffer as ArrayBuffer,
      );
      return new TextDecoder().decode(decrypted);
    }
    throw error;
  }
}
