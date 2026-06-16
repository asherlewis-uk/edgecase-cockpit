import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/platform.server", () => ({
  getDB: vi.fn(),
}));

import { getDB } from "@/lib/platform.server";
import {
  hashPassword,
  verifyPassword,
  createUser,
  getUserByEmail,
  getUserById,
  type User,
} from "@/lib/auth.server";

/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks use any for D1 stubs */

describe("auth.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("hashPassword", () => {
    it("produces a valid pbkdf2 hash string", async () => {
      const hash = await hashPassword("my-secret-password");
      expect(hash).toMatch(/^pbkdf2:sha256:600000:[a-f0-9]{32}:[a-f0-9]{64}$/);
    });

    it("produces different hashes for the same password (salt randomness)", async () => {
      const h1 = await hashPassword("same-password");
      const h2 = await hashPassword("same-password");
      expect(h1).not.toBe(h2);
    });
  });

  describe("verifyPassword", () => {
    it("returns true for the correct password", async () => {
      const hash = await hashPassword("correct-horse-battery-staple");
      expect(await verifyPassword("correct-horse-battery-staple", hash)).toBe(true);
    });

    it("returns false for the wrong password", async () => {
      const hash = await hashPassword("correct-horse-battery-staple");
      expect(await verifyPassword("wrong-password", hash)).toBe(false);
    });

    it("returns false for an invalid hash format", async () => {
      expect(await verifyPassword("password", "invalid-hash")).toBe(false);
    });

    it("returns false for a tampered hash", async () => {
      const hash = await hashPassword("password");
      const tampered = hash.slice(0, -1) + "x";
      expect(await verifyPassword("password", tampered)).toBe(false);
    });
  });

  describe("createUser", () => {
    it("creates a user and returns the public user", async () => {
      const mockDb = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          run: vi.fn(),
        }),
      };
      vi.mocked(getDB).mockReturnValue(mockDb as any);

      const result = await createUser("test@example.com", "hash123", "Test User");
      expect(result.error).toBeUndefined();
      expect(result.user.email).toBe("test@example.com");
      expect(result.user.display_name).toBe("Test User");
      expect((result.user as Record<string, unknown>).password_hash).toBeUndefined();
    });

    it("returns an error for duplicate email", async () => {
      const mockDb = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockRejectedValue(new Error("UNIQUE constraint failed")),
        }),
      };
      vi.mocked(getDB).mockReturnValue(mockDb as any);

      const result = await createUser("dup@example.com", "hash456");
      expect(result.error).toBe("Email already registered");
    });
  });

  describe("getUserByEmail", () => {
    it("returns a user with password_hash when found", async () => {
      const mockDb = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue({
            id: "user-1",
            email: "found@example.com",
            password_hash: "hash",
            display_name: "Found",
            created_at: 123,
            updated_at: 123,
          }),
        }),
      };
      vi.mocked(getDB).mockReturnValue(mockDb as any);

      const user = await getUserByEmail("found@example.com");
      expect(user).not.toBeNull();
      expect(user?.email).toBe("found@example.com");
      expect(user?.password_hash).toBe("hash");
    });

    it("returns null when not found", async () => {
      const mockDb = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(null),
        }),
      };
      vi.mocked(getDB).mockReturnValue(mockDb as any);

      const user = await getUserByEmail("missing@example.com");
      expect(user).toBeNull();
    });
  });

  describe("getUserById", () => {
    it("returns a user when found", async () => {
      const mockDb = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue({
            id: "user-2",
            email: "id@example.com",
            password_hash: "hash",
            display_name: null,
            created_at: 456,
            updated_at: 456,
          }),
        }),
      };
      vi.mocked(getDB).mockReturnValue(mockDb as any);

      const user = await getUserById("user-2");
      expect(user).not.toBeNull();
      expect(user?.id).toBe("user-2");
    });

    it("returns null when not found", async () => {
      const mockDb = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(null),
        }),
      };
      vi.mocked(getDB).mockReturnValue(mockDb as any);

      const user = await getUserById("missing-id");
      expect(user).toBeNull();
    });
  });
});

/* eslint-enable @typescript-eslint/no-explicit-any */
