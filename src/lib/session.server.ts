// Encrypted cookie session — keeps API keys server-side only.
// Browser never sees plaintext keys after this layer is in place.
import { useSession } from "@tanstack/react-start/server";

export type SessionProviderCreds = {
  apiKey: string;
  baseUrl?: string;
  model?: string;
};

export type SessionData = {
  id?: string;
  providers?: Record<string, SessionProviderCreds>;
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

export async function getCockpitSession() {
  const s = await useSession<SessionData>(config());
  if (!s.data.id) {
    await s.update({ ...s.data, id: crypto.randomUUID() });
  }
  return s;
}

export async function getProviderCreds(providerId: string): Promise<SessionProviderCreds | null> {
  const s = await getCockpitSession();
  return s.data.providers?.[providerId] ?? null;
}

export async function setProviderCreds(providerId: string, creds: SessionProviderCreds) {
  const s = await getCockpitSession();
  const next = { ...(s.data.providers ?? {}), [providerId]: creds };
  await s.update({ ...s.data, providers: next });
}

export async function clearProviderCreds(providerId?: string) {
  const s = await getCockpitSession();
  if (!providerId) {
    await s.update({ ...s.data, providers: {} });
    return;
  }
  const next = { ...(s.data.providers ?? {}) };
  delete next[providerId];
  await s.update({ ...s.data, providers: next });
}
