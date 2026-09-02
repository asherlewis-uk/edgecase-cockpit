/**
 * The provider facade: one surface for catalog, detection, routing, model-list
 * and status.
 *
 * providers.ts stays one module — this is not a monorepo split. What this buys
 * is a single place to read what the UI is allowed to ask of a provider, and a
 * single test (provider-api.test.ts) asserting the catalog keeps all 15 entries.
 * Cloud providers are supported infrastructure; they are not hidden to make the
 * product look more local-first.
 */
// Catalog
export { PROVIDERS, getProvider } from "./providers";
export {
  V1_LOCAL_OPENAI_COMPAT_ENDPOINT_ID,
  V1_LOCAL_OPENAI_COMPAT_PROVIDER_ID,
} from "./providers";
// Detection + status
export { detectProvider, deriveLocalCapabilityState } from "./providers";
// Model list
export { probeLocalOpenAICompatibleModels } from "./providers";
// Routing
export {
  callProviderChat,
  callProviderChatViaProxy,
  transcribeAudioViaProxy,
  ProviderError,
} from "./providers";
export type {
  ProviderDef,
  Capability,
  BodyStyle,
  AuthStyle,
  Model,
  ChatMessage,
  ProviderCallOpts,
  DetectResult,
  ModelListProbeResult,
  ModelListProbeOptions,
  LocalCapabilityState,
  LocalCapabilityStatus,
  LocalCapabilityEnvironment,
  LocalCapabilityStateInput,
} from "./providers";
