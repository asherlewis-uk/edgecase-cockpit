import { afterEach, describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@tanstack/react-start/server", () => ({
  useSession: vi.fn(),
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
import { getGuestSessionId } from "@/lib/session.server";

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

/* eslint-enable @typescript-eslint/no-explicit-any */
