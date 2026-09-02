import { describe, it, expect } from "vitest";
import {
  settingsKey,
  threadsKey,
  statsKey,
  vectorKey,
  validationKey,
  legacyGuestKeys,
  LEGACY_GUEST_SCOPE,
} from "./account-buckets";

describe("account-buckets", () => {
  it("derives one key per family from a scope", () => {
    expect(settingsKey("u1")).toBe("cockpit.settings.v2:u1");
    expect(threadsKey("u1")).toBe("cockpit.threads.v1:u1");
    expect(statsKey("u1")).toBe("cockpit.provider-stats.v1:u1");
    expect(vectorKey("u1")).toBe("cockpit.vector-store.v1:u1");
    expect(validationKey("u1")).toBe("cockpit.provider-validation.v1:u1");
  });

  it("keeps distinct scopes in distinct buckets", () => {
    expect(settingsKey("a")).not.toBe(settingsKey("b"));
    expect(vectorKey("a")).not.toBe(vectorKey("b"));
  });

  it("exposes the legacy guest keys for one-time migration only", () => {
    expect(legacyGuestKeys()).toEqual({
      settings: "cockpit.settings.v2:guest",
      threads: "cockpit.threads.v1:guest",
      stats: "cockpit.provider-stats.v1:guest",
      vector: "cockpit.vector-store.v1:guest",
    });
    expect(LEGACY_GUEST_SCOPE).toBe("guest");
  });
});
