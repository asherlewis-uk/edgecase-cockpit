import { describe, it, expect } from "vitest";
import * as facade from "./store";

const ALLOWED = [
  "store",
  "useStore",
  "hydrateAsync",
  "enterLocalMode",
  "enterServerMode",
  "ensureLocalProfileId",
  "copyLocalToServer",
  "moveLocalToServer",
  "register",
  "login",
  "logout",
  "csrfHeaders",
  "resolveProvider",
  "isProviderReady",
  "providerHasKey",
  "getProviderValidationStatus",
  "setProviderValidationStatus",
  "clearProviderValidationStatus",
  "deriveV1LocalEndpointCapabilityState",
  "useOnboardingState",
  "getProviderStats",
  "subscribeProviderStats",
  "bumpProviderStat",
  "recordTokenUsage",
  "resetProviderStats",
  "defaultSettings",
  "defaultProfile",
  "defaultPersonalization",
  "defaultKeyboardShortcuts",
  "defaultRagSettings",
  "deriveInitials",
].sort();

describe("store facade", () => {
  it("exposes exactly the sanctioned runtime surface", () => {
    expect(Object.keys(facade).sort()).toEqual(ALLOWED);
  });

  it("keeps persistence, auth-session and identity internals private", () => {
    for (const leaked of [
      "fetchMe",
      "refreshProviderKeyStatus",
      "migrateGuestBucketToLocalProfile",
      "writeAccountMode",
      "writeLocalProfileId",
      "normalizeSettings",
      "__resetHydration",
      "PROVIDERS",
    ]) {
      expect(facade, `${leaked} must not be reachable through the facade`).not.toHaveProperty(
        leaked,
      );
    }
  });
});
