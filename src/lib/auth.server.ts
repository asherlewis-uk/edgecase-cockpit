// Backend authentication module for Edgecase Cockpit.
// Uses Web Crypto PBKDF2 for password hashing (native in Cloudflare Workers).
// No bcrypt/argon2 dependencies — avoids native module issues on Edge runtime.

import { getDB } from "@/lib/platform.server";

const PBKDF2_ITERATIONS = 600_000; // OWASP 2023 recommendation for PBKDF2-HMAC-SHA256
const PBKDF2_KEYLEN_BITS = 256; // 32 bytes
const SALT_BYTES = 16; // 128-bit salt

export type User = {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  created_at: number;
  updated_at: number;
};

export type UserPublic = Omit<User, "password_hash">;

// ── Password hashing ───────────────────────────────────────────────────────

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

async function pbkdf2Hash(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const keyData = new TextEncoder().encode(password);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    keyData.buffer as ArrayBuffer,
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    PBKDF2_KEYLEN_BITS,
  );
  return new Uint8Array(derivedBits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt);
  const hash = await pbkdf2Hash(password, salt);
  return `pbkdf2:sha256:${PBKDF2_ITERATIONS}:${encodeHex(salt)}:${encodeHex(hash)}`;
}

export async function verifyPassword(password: string, hashString: string): Promise<boolean> {
  const parts = hashString.split(":");
  if (parts.length !== 5 || parts[0] !== "pbkdf2" || parts[1] !== "sha256") {
    return false;
  }
  const iterations = parseInt(parts[2], 10);
  if (isNaN(iterations) || iterations < 1) return false;
  const salt = decodeHex(parts[3]);
  const expectedHash = decodeHex(parts[4]);

  const keyData = new TextEncoder().encode(password);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    keyData.buffer as ArrayBuffer,
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    expectedHash.length * 8,
  );
  const derived = new Uint8Array(derivedBits);

  if (derived.length !== expectedHash.length) return false;
  let result = 0;
  for (let i = 0; i < derived.length; i++) {
    result |= derived[i] ^ expectedHash[i];
  }
  return result === 0;
}

// ── User CRUD ──────────────────────────────────────────────────────────────

export async function createUser(
  email: string,
  passwordHash: string,
  displayName?: string,
): Promise<{ user: UserPublic; error?: string }> {
  const db = getDB();
  const id = crypto.randomUUID();
  const now = Date.now();

  try {
    await db
      .prepare(
        "INSERT INTO users (id, email, password_hash, display_name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
      )
      .bind(id, email.toLowerCase().trim(), passwordHash, displayName ?? null, now, now)
      .run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE") || msg.includes("unique") || msg.includes("already exists")) {
      return { user: null as unknown as UserPublic, error: "Email already registered" };
    }
    throw e;
  }

  return {
    user: {
      id,
      email: email.toLowerCase().trim(),
      display_name: displayName ?? null,
      created_at: now,
      updated_at: now,
    },
  };
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const db = getDB();
  const row = await db
    .prepare("SELECT * FROM users WHERE email = ?1")
    .bind(email.toLowerCase().trim())
    .first<Record<string, unknown>>();
  if (!row) return null;
  return rowToUser(row);
}

export async function getUserById(id: string): Promise<User | null> {
  const db = getDB();
  const row = await db
    .prepare("SELECT * FROM users WHERE id = ?1")
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return null;
  return rowToUser(row);
}

function rowToUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    email: row.email as string,
    password_hash: row.password_hash as string,
    display_name: (row.display_name as string | null) ?? null,
    created_at: row.created_at as number,
    updated_at: row.updated_at as number,
  };
}

export function stripPassword(user: User): UserPublic {
  const { password_hash: _, ...rest } = user;
  return rest;
}

// ── Auth helpers ───────────────────────────────────────────────────────────

export type AuthResult = { ok: true; user: UserPublic } | { ok: false; response: Response };

/**
 * Require an authenticated user. Returns the user if the session has a valid
 * userId, otherwise returns a 401 Response.
 */
export async function requireAuth(userId: string | undefined): Promise<AuthResult> {
  if (!userId) {
    return {
      ok: false,
      response: Response.json({ error: "Authentication required" }, { status: 401 }),
    };
  }
  const user = await getUserById(userId);
  if (!user) {
    return {
      ok: false,
      response: Response.json({ error: "User not found" }, { status: 401 }),
    };
  }
  return { ok: true, user: stripPassword(user) };
}

export function requireAuthResponse(): Response {
  return Response.json({ error: "Authentication required" }, { status: 401 });
}

// ── Guest Session Claim ──────────────────────────────────────────────────────

export async function claimGuestSession(guestId: string, userId: string): Promise<void> {
  const db = getDB();

  // Migrate threads
  await db
    .prepare(
      "UPDATE threads SET user_id = ?1, session_id = NULL WHERE session_id = ?2 AND user_id IS NULL",
    )
    .bind(userId, guestId)
    .run();

  // Migrate provider_stats
  await db
    .prepare(
      "UPDATE provider_stats SET user_id = ?1, session_id = NULL WHERE session_id = ?2 AND user_id IS NULL",
    )
    .bind(userId, guestId)
    .run();

  // Migrate usage_records
  await db
    .prepare(
      "UPDATE usage_records SET user_id = ?1, session_id = NULL WHERE session_id = ?2 AND user_id IS NULL",
    )
    .bind(userId, guestId)
    .run();

  // Migrate vector_docs
  await db
    .prepare(
      "UPDATE vector_docs SET user_id = ?1, session_id = NULL WHERE session_id = ?2 AND user_id IS NULL",
    )
    .bind(userId, guestId)
    .run();

  // Delete the guest session
  await db.prepare("DELETE FROM guest_sessions WHERE id = ?1").bind(guestId).run();
}

export async function createGuestSession(id: string, data: Record<string, unknown> = {}): Promise<void> {
  const db = getDB();
  const now = Date.now();
  const expiresAt = now + 30 * 24 * 60 * 60 * 1000; // 30 days
  await db
    .prepare(
      "INSERT INTO guest_sessions (id, data_json, created_at, updated_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)",
    )
    .bind(id, JSON.stringify(data), now, now, expiresAt)
    .run();
}

export async function deleteGuestSession(id: string): Promise<void> {
  const db = getDB();
  await db.prepare("DELETE FROM guest_sessions WHERE id = ?1").bind(id).run();
}
