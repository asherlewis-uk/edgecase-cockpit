import { afterEach, describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@tanstack/react-start/server", () => ({
  useSession: vi.fn(),
  sealSession: vi.fn(async () => "sealed"),
  setCookie: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getUserProviderKey: vi.fn(),
  setUserProviderKey: vi.fn(),
  clearUserProviderKey: vi.fn(),
}));

vi.mock("@/lib/encryption.server", () => ({
  encrypt: vi.fn(),
  decrypt: vi.fn(),
}));

import { useSession } from "@tanstack/react-start/server";
import {
  getGuestSessionId,
  getCockpitSession,
  setAuthSession,
  clearAuthSession,
  clearGuestSessionId,
  getAuthUserId,
} from "@/lib/session.server";

/* eslint-disable @typescript-eslint/no-explicit-any -- session tests mock TanStack session internals */

describe("getGuestSessionId", () => {
  const originalSessionSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SESSION_SECRET = "test-session-secret-32-characters";
  });

  afterEach(() => {
    if (originalSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSessionSecret;
    }
  });

  it("uses the cookie session id as the guest owner id", async () => {
    const update = vi.fn();
    vi.mocked(useSession).mockResolvedValue({
      data: { id: "session-1", guestSessionId: "old-guest-id" },
      update,
    } as any);

    const guestId = await getGuestSessionId();

    expect(guestId).toBe("session-1");
    expect(update).toHaveBeenCalledWith({
      id: "session-1",
      guestSessionId: "session-1",
    });
  });

  it("returns undefined for authenticated users", async () => {
    const update = vi.fn();
    vi.mocked(useSession).mockResolvedValue({
      data: { id: "session-1", userId: "user-1", guestSessionId: "session-1" },
      update,
    } as any);

    await expect(getGuestSessionId()).resolves.toBeUndefined();
    expect(update).not.toHaveBeenCalled();
  });
});

describe("session cookie configuration", () => {
  const originalSessionSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SESSION_SECRET = "test-session-secret-32-characters";
  });

  afterEach(() => {
    if (originalSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSessionSecret;
    }
  });

  it("uses an encrypted, httpOnly, secure, SameSite=Lax session cookie", async () => {
    vi.mocked(useSession).mockResolvedValue({
      data: { id: "session-1" },
      update: vi.fn(),
    } as any);

    await getCockpitSession();

    expect(useSession).toHaveBeenCalledTimes(1);
    const config = vi.mocked(useSession).mock.calls[0][0] as {
      name: string;
      password: string;
      maxAge: number;
      cookie: { httpOnly: boolean; sameSite: string; secure: boolean; path: string };
    };

    expect(config.name).toBe("cockpit-session");
    expect(config.password).toBe("test-session-secret-32-characters");
    expect(config.maxAge).toBe(60 * 60 * 24 * 30);
    expect(config.cookie).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
    });
  });
});

describe("setAuthSession", () => {
  const originalSessionSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SESSION_SECRET = "test-session-secret-32-characters";
  });

  afterEach(() => {
    if (originalSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSessionSecret;
    }
  });

  it("stores userId and userEmail in the session", async () => {
    const update = vi.fn();
    vi.mocked(useSession).mockResolvedValue({
      data: { id: "session-1" },
      update,
    } as any);

    await setAuthSession("user-1", "user@example.com");

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      id: "session-1",
      userId: "user-1",
      userEmail: "user@example.com",
      guestSessionId: undefined,
    });
  });
});

describe("clearAuthSession", () => {
  const originalSessionSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SESSION_SECRET = "test-session-secret-32-characters";
  });

  afterEach(() => {
    if (originalSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSessionSecret;
    }
  });

  it("removes userId and userEmail from session data", async () => {
    const update = vi.fn();
    vi.mocked(useSession).mockResolvedValue({
      data: {
        id: "session-1",
        userId: "user-1",
        userEmail: "user@example.com",
        guestSessionId: "guest-1",
      },
      update,
    } as any);

    await clearAuthSession();

    expect(update).toHaveBeenCalledTimes(1);
    const updateArg = update.mock.calls[0][0];
    expect(updateArg).toMatchObject({
      id: "session-1",
      guestSessionId: "guest-1",
      userId: undefined,
      userEmail: undefined,
    });
  });

  it("removes userId even when session has no guestSessionId", async () => {
    const update = vi.fn();
    vi.mocked(useSession).mockResolvedValue({
      data: {
        id: "session-1",
        userId: "user-1",
        userEmail: "user@example.com",
      },
      update,
    } as any);

    await clearAuthSession();

    const updateArg = update.mock.calls[0][0];
    expect(updateArg).toMatchObject({
      id: "session-1",
      userId: undefined,
      userEmail: undefined,
    });
  });

  it("leaves getAuthUserId undefined after clearing", async () => {
    const update = vi.fn();
    const clearedData = {
      id: "session-1",
      guestSessionId: "guest-1",
    };
    vi.mocked(useSession)
      .mockResolvedValueOnce({
        data: {
          id: "session-1",
          userId: "user-1",
          userEmail: "user@example.com",
          guestSessionId: "guest-1",
        },
        update,
      } as any)
      .mockResolvedValueOnce({
        data: clearedData,
        update: vi.fn(),
      } as any);

    await clearAuthSession();

    // Simulate the re-sealed cookie being read back: session no longer contains identity
    const userId = await getAuthUserId();
    expect(userId).toBeUndefined();
  });
});

describe("clearGuestSessionId", () => {
  const originalSessionSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SESSION_SECRET = "test-session-secret-32-characters";
  });

  afterEach(() => {
    if (originalSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSessionSecret;
    }
  });

  it("removes guestSessionId from session data", async () => {
    const update = vi.fn();
    vi.mocked(useSession).mockResolvedValue({
      data: { id: "session-1", guestSessionId: "guest-1" },
      update,
    } as any);

    await clearGuestSessionId();

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      id: "session-1",
      guestSessionId: undefined,
    });
  });
});
/* eslint-enable @typescript-eslint/no-explicit-any */
