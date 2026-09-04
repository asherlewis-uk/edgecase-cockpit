/**
 * The store facade: the only cockpit-store surface routes and components may use.
 *
 * cockpit-store.ts stays a single fat module — it is not being split — but its
 * auth-session, persistence, bucket-key, stats-internal, pricing and RAG plumbing
 * are no longer reachable from the UI layer. Tests still import cockpit-store.ts
 * directly; the eslint rule below restricts routes and components only.
 *
 * Adding an export here is a deliberate widening of the contract. Update
 * store.test.ts in the same commit so the surface stays asserted.
 */
export { store, useStore, hydrateAsync, enterLocalMode, enterServerMode } from "./cockpit-store";
export {
  ensureLocalProfileId,
  copyLocalToServer,
  moveLocalToServer,
  pushAccountSettingsToServer,
} from "./cockpit-store";
export { register, login, logout, csrfHeaders } from "./cockpit-store";
export { resolveProvider, isProviderReady, providerHasKey } from "./cockpit-store";
export {
  getProviderValidationStatus,
  setProviderValidationStatus,
  clearProviderValidationStatus,
} from "./cockpit-store";
export { deriveV1LocalEndpointCapabilityState, useOnboardingState } from "./cockpit-store";
export {
  getProviderStats,
  subscribeProviderStats,
  bumpProviderStat,
  recordTokenUsage,
  resetProviderStats,
} from "./cockpit-store";
export {
  defaultSettings,
  defaultProfile,
  defaultPersonalization,
  defaultKeyboardShortcuts,
  defaultRagSettings,
  deriveInitials,
} from "./cockpit-store";
export type {
  AccountMode,
  Settings,
  Thread,
  Message,
  UserPublic,
  UserProfile,
  Personalization,
  KeyboardShortcuts,
  RagSettings,
  ProviderConfig,
  ProviderStat,
} from "./cockpit-store";
