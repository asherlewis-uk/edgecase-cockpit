// Server-side AES-256-GCM encryption for sensitive user data.
// Uses Web Crypto API (native in Cloudflare Workers).
// The encryption key is derived from SESSION_SECRET or a dedicated ENCRYPTION_KEY.

const AES_ALGORITHM = "AES-GCM";
const AES_KEY_LENGTH = 256;
const IV_LENGTH_BYTES = 12; // 96-bit IV for GCM

function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!key || key.length < 32) {
    throw new Error(
      "ENCRYPTION_KEY or SESSION_SECRET must be set and at least 32 characters long",
    );
  }
  return key;
}

async function deriveAesKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  return crypto.subtle.importKey("raw", keyData, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
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

  const decrypted = await crypto.subtle.decrypt(
    { name: AES_ALGORITHM, iv: iv.buffer as ArrayBuffer },
    key,
    combined.buffer as ArrayBuffer,
  );

  return new TextDecoder().decode(decrypted);
}
