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

// The facade's top-level surface test (below) asserts Object.keys on the module,
// so it cannot see methods added to the exported `store` object. That blind spot
// let `store.refreshProviderKeyStatus` — a delegating path to a symbol the brief
// lists as off-limits to routes — slip through in the same commit that added the
// test. Pinning the method list makes today's addition explicit and reviewed, and
// makes any future store method a deliberate widening of the UI contract.
const STORE_METHODS = [
  "addMessage",
  "archiveThread",
  "clearAll",
  "clearThreadMessages",
  "clearUser",
  "completeOnboarding",
  "deleteMessage",
  "deleteThread",
  "duplicateThread",
  "enterLocalMode",
  "enterServerMode",
  "exportThread",
  "getMessageCount",
  "getState",
  "getThreadCount",
  "getTotalTokens",
  "importThreads",
  "logout",
  "mergeThreads",
  "newThread",
  "patchMessage",
  "pinThread",
  "refreshProviderKeyStatus",
  "renameThread",
  "reorderThreads",
  "resetKeyboardShortcuts",
  "resetOnboarding",
  "resetPersonalization",
  "resetProfile",
  "searchThreads",
  "selectThread",
  "setActiveProvider",
  "setThreadColor",
  "setThreadMessages",
  "setThreadTemporary",
  "setUser",
  "skipOnboarding",
  "subscribe",
  "togglePinned",
  "unarchiveThread",
  "unpinThread",
  "updateKeyboardShortcuts",
  "updatePersonalization",
  "updateProfile",
  "updateProviderConfig",
  "updateSettings",
].sort();

describe("store facade", () => {
  it("exposes exactly the sanctioned runtime surface", () => {
    expect(Object.keys(facade).sort()).toEqual(ALLOWED);
  });

  it("pins the store object's callable method surface", () => {
    expect(Object.keys(facade.store).sort()).toEqual(STORE_METHODS);
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
