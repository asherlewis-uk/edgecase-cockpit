import { describe, it, expect, beforeEach, vi } from "vitest";

/* eslint-disable @typescript-eslint/no-explicit-any -- route handler stubs */

vi.mock("@/lib/session.server", () => ({
  getAuthUserId: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/db", () => ({
  getUserSettings: vi.fn().mockResolvedValue(null),
  setUserSettings: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/proxy-guard.server", () => ({
  rateLimit: vi.fn(() => ({ ok: true })),
  urlAllowedForProvider: vi.fn(() => true),
}));

vi.mock("@/lib/csrf.server", () => ({
  validateCsrfToken: vi.fn(() => true),
}));

import { getAuthUserId } from "@/lib/session.server";
import { getUserSettings, setUserSettings } from "@/lib/db";
import { clearRateLimitBuckets } from "@/lib/rate-limit.server";

const CSRF_TOKEN = "aabbccdd00112233aabbccdd00112233aabbccdd00112233aabbccdd00112233";
const CSRF_HEADERS = {
  "Content-Type": "application/json",
  "X-CSRF-Token": CSRF_TOKEN,
  Cookie: `csrf-token=${CSRF_TOKEN}`,
};

beforeEach(() => {
  clearRateLimitBuckets();
  vi.clearAllMocks();
});

describe("GET /api/settings", () => {
  it("returns 401 for guests", async () => {
    vi.mocked(getAuthUserId).mockResolvedValue(undefined);

    const mod = await import("@/routes/api/settings");
    const handler = (mod.Route.options as any).server.handlers.GET;

    const res = await handler();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Authentication required");
  });

  it("returns settings scoped to the authenticated user", async () => {
    vi.mocked(getAuthUserId).mockResolvedValue("user-a");
    vi.mocked(getUserSettings).mockResolvedValue({
      profileJson: JSON.stringify({ displayName: "User A" }),
      personalizationJson: JSON.stringify({ assistantName: "A Copilot" }),
      keyboardShortcutsJson: JSON.stringify({}),
      ragJson: JSON.stringify({ enabled: false }),
      activeProviderId: "openai",
      pinnedProviderIdsJson: JSON.stringify(["openai"]),
      costOverridesJson: JSON.stringify({ openai: { input: 0.001 } }),
      onboardingCompleted: false,
      syncThreadsEnabled: false,
    });

    const mod = await import("@/routes/api/settings");
    const handler = (mod.Route.options as any).server.handlers.GET;

    const res = await handler();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile.displayName).toBe("User A");
    expect(body.personalization.assistantName).toBe("A Copilot");
    expect(body.costOverrides.openai).toEqual({ input: 0.001 });
    expect(getUserSettings).toHaveBeenCalledWith("user-a");
  });
});

describe("POST /api/settings", () => {
  it("returns 401 for guests", async () => {
    vi.mocked(getAuthUserId).mockResolvedValue(undefined);

    const mod = await import("@/routes/api/settings");
    const handler = (mod.Route.options as any).server.handlers.POST;

    const res = await handler({
      request: new Request("http://localhost/api/settings", {
        method: "POST",
        headers: CSRF_HEADERS,
        body: JSON.stringify({ profile: { displayName: "Guest" } }),
      }),
    });
    expect(res.status).toBe(401);
  });

  it("saves settings scoped to the authenticated user", async () => {
    vi.mocked(getAuthUserId).mockResolvedValue("user-a");

    const mod = await import("@/routes/api/settings");
    const handler = (mod.Route.options as any).server.handlers.POST;

    const res = await handler({
      request: new Request("http://localhost/api/settings", {
        method: "POST",
        headers: CSRF_HEADERS,
        body: JSON.stringify({
          profile: { displayName: "User A" },
          costOverrides: { openai: { input: 0.002 } },
        }),
      }),
    });
    expect(res.status).toBe(200);
    expect(setUserSettings).toHaveBeenCalledWith(
      "user-a",
      expect.objectContaining({
        profileJson: JSON.stringify({ displayName: "User A" }),
        costOverridesJson: JSON.stringify({ openai: { input: 0.002 } }),
      }),
    );
  });

  it("User B cannot read User A's saved settings", async () => {
    const db: Record<string, any> = {};
    vi.mocked(setUserSettings).mockImplementation(async (userId, settings) => {
      db[userId] = settings;
    });
    vi.mocked(getUserSettings).mockImplementation(async (userId) => {
      const s = db[userId];
      if (!s) return null;
      return {
        profileJson: s.profileJson ?? "{}",
        personalizationJson: s.personalizationJson ?? "{}",
        keyboardShortcutsJson: s.keyboardShortcutsJson ?? "{}",
        ragJson: s.ragJson ?? "{}",
        activeProviderId: s.activeProviderId ?? null,
        pinnedProviderIdsJson: s.pinnedProviderIdsJson ?? "[]",
        costOverridesJson: s.costOverridesJson ?? null,
        onboardingCompleted: s.onboardingCompleted ?? false,
        syncThreadsEnabled: s.syncThreadsEnabled ?? false,
      };
    });

    const mod = await import("@/routes/api/settings");
    const getHandler = (mod.Route.options as any).server.handlers.GET;
    const postHandler = (mod.Route.options as any).server.handlers.POST;

    // User A saves settings.
    vi.mocked(getAuthUserId).mockResolvedValue("user-a");
    await postHandler({
      request: new Request("http://localhost/api/settings", {
        method: "POST",
        headers: CSRF_HEADERS,
        body: JSON.stringify({ profile: { displayName: "User A" } }),
      }),
    });

    // User A reads their own settings.
    const resA = await getHandler();
    const bodyA = await resA.json();
    expect(bodyA.profile.displayName).toBe("User A");

    // User B reads settings and does not see User A's data.
    vi.mocked(getAuthUserId).mockResolvedValue("user-b");
    const resB = await getHandler();
    const bodyB = await resB.json();
    expect(bodyB.profile.displayName).not.toBe("User A");
    expect(bodyB.costOverrides).toBeNull();
  });
});

/* eslint-enable @typescript-eslint/no-explicit-any */
