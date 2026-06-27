// Encrypted cookie session — used for CSRF continuity and rate-limit identity.
// Provider credentials are stored in user_provider_keys (DB), NOT in the session.
// Anonymous guests use a guestSessionId stored in the cookie session.

import { useSession as startSession, sealSession, setCookie } from "@tanstack/react-start/server";

export type SessionProviderCreds = {
  apiKey: string;
  baseUrl?: string;
  model?: string;
};

export type SessionData = {
  id?: string;
  userId?: string;
  userEmail?: string;
  guestSessionId?: string;
};

function config() {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error("SESSION_SECRET missing or shorter than 32 chars");
  }
  return {
    password,
    name: "cockpit-session",
    maxAge: 60 * 60 * 24 * 30,
    cookie: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: true,
      path: "/",
    },
  };
}

/** Re-seal the current session data and write the cookie back to the response. */
async function commitSessionCookie() {
  const cfg = config();
  const sealed = await sealSession(cfg);
  setCookie(cfg.name, sealed, { maxAge: cfg.maxAge, ...cfg.cookie });
}
export async function getCockpitSession() {
  const s = await startSession<SessionData>(config());
  if (!s.data.id) {
    await s.update({ ...s.data, id: crypto.randomUUID() });
  }
  return s;
}

/** Clear the authenticated user from the session (logout). */
export async function clearAuthSession() {
  const s = await getCockpitSession();
  await s.update({ ...s.data, userId: undefined, userEmail: undefined });
  await commitSessionCookie();
}

/** Set the authenticated user in the session (login). */
export async function setAuthSession(userId: string, userEmail: string) {
  const s = await getCockpitSession();
  await s.update({ ...s.data, userId, userEmail, guestSessionId: undefined });
  await commitSessionCookie();
}

/** Get the current authenticated user ID, if any. */
export async function getAuthUserId(): Promise<string | undefined> {
  const s = await getCockpitSession();
  return s.data.userId;
}

/** Get or create the guest session ID for anonymous users. */
export async function getGuestSessionId(): Promise<string | undefined> {
  const s = await getCockpitSession();
  if (s.data.userId) return undefined; // authenticated users are not guests

  const sessionId = s.data.id ?? s.data.guestSessionId ?? crypto.randomUUID();
  const guestId = sessionId;

  if (s.data.guestSessionId !== guestId || s.data.id !== sessionId) {
    await s.update({ ...s.data, id: sessionId, guestSessionId: guestId });
    await commitSessionCookie();
  }

  return guestId;
}

/** Clear the guest session ID (e.g., after claiming). */
export async function clearGuestSessionId() {
  const s = await getCockpitSession();
  await s.update({ ...s.data, guestSessionId: undefined });
  await commitSessionCookie();
}

// ── Provider Credentials (DB-backed, encrypted) ────────────────────────────

import { getUserProviderKey, setUserProviderKey, clearUserProviderKey } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/encryption.server";

export async function getProviderCreds(providerId: string): Promise<SessionProviderCreds | null> {
  const userId = await getAuthUserId();
  if (!userId) return null;
  const row = await getUserProviderKey(userId, providerId);
  if (!row) return null;
  const apiKey = await decrypt(row.apiKeyEncrypted);
  return {
    apiKey,
    baseUrl: row.baseUrl,
    model: row.model,
  };
}

export async function setProviderCreds(providerId: string, creds: SessionProviderCreds) {
  const userId = await getAuthUserId();
  if (!userId) {
    throw new Error("Authentication required to store provider credentials");
  }
  const encrypted = await encrypt(creds.apiKey);
  await setUserProviderKey(userId, providerId, encrypted, creds.baseUrl, creds.model);
}

export async function clearProviderCreds(providerId?: string) {
  const userId = await getAuthUserId();
  if (!userId) return;
  await clearUserProviderKey(userId, providerId);
}
