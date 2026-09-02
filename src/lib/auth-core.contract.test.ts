import { describe, it, expect, afterEach } from "vitest";
import { encrypt, decrypt } from "./encryption.server";

const ORIGINAL = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("encryption key derivation", () => {
  it("works with a key longer than 32 characters", async () => {
    // getEncryptionKey accepts length >= 32, so a 40-char key must work end to
    // end. Today it passes validation and throws inside importKey.
    process.env.ENCRYPTION_KEY = "k".repeat(40);
    const sealed = await encrypt("provider-api-key");
    expect(await decrypt(sealed)).toBe("provider-api-key");
  });

  it("works with a key of exactly 32 characters", async () => {
    process.env.ENCRYPTION_KEY = "k".repeat(32);
    const sealed = await encrypt("provider-api-key");
    expect(await decrypt(sealed)).toBe("provider-api-key");
  });

  it("produces a different ciphertext for the same plaintext each time", async () => {
    process.env.ENCRYPTION_KEY = "k".repeat(32);
    const a = await encrypt("same");
    const b = await encrypt("same");
    expect(a).not.toBe(b);
    expect(a.split(":")[0]).not.toBe(b.split(":")[0]); // distinct IVs
  });

  it("works with a 32-character key containing multi-byte characters", async () => {
    // getEncryptionKey checks key.length (characters), but TextEncoder yields
    // bytes: a 32-char secret with multi-byte UTF-8 encodes to >32 bytes and
    // threw inside importKey for the same reason as an over-long ASCII key.
    process.env.ENCRYPTION_KEY = "é".repeat(32); // 64 bytes UTF-8
    const sealed = await encrypt("provider-api-key");
    expect(await decrypt(sealed)).toBe("provider-api-key");
  });

  it("decrypts a value encrypted under the legacy raw-bytes key", async () => {
    // Ciphertext written before the SHA-256 derivation used the secret's raw
    // UTF-8 bytes as the AES key. Simulate that here so the legacy fallback in
    // decrypt() is exercised against real legacy-format ciphertext.
    process.env.ENCRYPTION_KEY = "k".repeat(32);
    const encoder = new TextEncoder();
    const legacyKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode("k".repeat(32)),
      { name: "AES-GCM" },
      false,
      ["encrypt"],
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertextBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      legacyKey,
      encoder.encode("provider-api-key"),
    );
    const combined = new Uint8Array(ciphertextBuffer);
    const ciphertext = combined.slice(0, combined.length - 16);
    const authTag = combined.slice(combined.length - 16);
    const hex = (bytes: Uint8Array) =>
      Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    const sealed = `${hex(iv)}:${hex(ciphertext)}:${hex(authTag)}`;

    expect(await decrypt(sealed)).toBe("provider-api-key");
  });
});
