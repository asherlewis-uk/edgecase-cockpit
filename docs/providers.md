# Providers

The provider catalog and its capabilities, first-launch onboarding, provider setup and key validation, and troubleshooting. Moved verbatim from the root `README.md`.

## 6. Provider infrastructure and V1 proof target

The V1 proof target is a user-configured generic local OpenAI-compatible endpoint. This is a declared product decision made now, not recovered from prior named-provider evidence. Existing providers are implementation candidates, compatibility surfaces, or future named presets; they are not V1 commitments. Hermes Agent, OpenClaw, Ollama, LM Studio, vLLM, llama.cpp, and other named providers are not the V1 proof set.

| Provider                   | V1 role                                                                               | Chat | Models | Tools | Streaming Tools | Embeddings | Vision | Transcription | Type  | Body style |
| -------------------------- | ------------------------------------------------------------------------------------- | ---- | ------ | ----- | --------------- | ---------- | ------ | ------------- | ----- | ---------- |
| Hermes Agent (`hermes`)    | Catalog candidate/future preset; not V1                                               | ✅   | ✅     | ✅    | ❌              | ✅         | ❌     | ❌            | Local | openai     |
| OpenClaw                   | Catalog candidate/future preset; not V1                                               | ✅   | ✅     | ✅    | ❌              | ❌         | ❌     | ❌            | Local | openai     |
| Ollama (local)             | Catalog candidate/future preset; not V1                                               | ✅   | ✅     | ✅    | ❌              | ✅         | ✅     | ❌            | Local | openai     |
| OpenAI                     | Supported infrastructure                                                              | ✅   | ✅     | ✅    | ✅              | ✅         | ✅     | ✅            | Cloud | openai     |
| Anthropic                  | Supported infrastructure                                                              | ✅   | ✅     | ✅    | ✅              | ❌         | ✅     | ❌            | Cloud | anthropic  |
| Google Gemini              | Supported infrastructure                                                              | ✅   | ✅     | ✅    | ✅              | ✅         | ✅     | ❌            | Cloud | openai     |
| Moonshot / KimiCoding      | Supported infrastructure                                                              | ✅   | ✅     | ✅    | ❌              | ❌         | ❌     | ❌            | Cloud | openai     |
| OpenRouter                 | Supported infrastructure                                                              | ✅   | ✅     | ✅    | ❌              | ❌         | ✅     | ❌            | Cloud | openai     |
| Ollama Cloud               | Supported infrastructure                                                              | ✅   | ✅     | ❌    | ❌              | ✅         | ❌     | ❌            | Cloud | openai     |
| NVIDIA NIM                 | Supported infrastructure                                                              | ✅   | ✅     | ✅    | ❌              | ✅         | ✅     | ❌            | Cloud | openai     |
| Vercel AI Gateway          | Supported infrastructure                                                              | ✅   | ✅     | ✅    | ❌              | ✅         | ✅     | ❌            | Cloud | openai     |
| LM Studio                  | Catalog candidate/future preset; not V1                                               | ✅   | ✅     | ❌    | ❌              | ✅         | ✅     | ❌            | Local | openai     |
| vLLM                       | Catalog candidate/future preset; not V1                                               | ✅   | ✅     | ✅    | ❌              | ✅         | ✅     | ❌            | Local | openai     |
| llama.cpp server           | Catalog candidate/future preset; not V1                                               | ✅   | ✅     | ❌    | ❌              | ✅         | ✅     | ❌            | Local | openai     |
| Custom (OpenAI-compatible) | Implementation surface for the generic local endpoint; not a named-provider V1 preset | ✅   | ✅     | ✅    | ❌              | ✅         | ✅     | ✅            | Local | openai     |

**Streaming tools** is implemented client-side via `StreamToolCallAccumulator` (OpenAI body style) and `AnthropicStreamToolCallAccumulator` + `extractAnthropicToolCallDelta` (Anthropic body style). Gemini uses the OpenAI-compatible path. Providers without `streamingTools: true` in their capability flags fall back to non-streaming when tools are present.

Source: `src/lib/providers.ts` (capability declarations), `src/hooks/use-chat.ts` (`supportsOpenAIStreamingTools`, `supportsAnthropicStreamingTools`), `src/lib/tools.ts` (accumulator implementations).

**Capability flags are declarations in `providers.ts`.** Not all combinations have been end-to-end verified against real provider APIs. Live verification requires `RUN_LIVE_PROVIDER_TESTS=true` with real credentials (see Section 14).

**Custom provider wildcard policy:** The `custom` provider has `allowedHosts: ["*"]`. In production, wildcard host matching is **blocked** unless `PROXY_ALLOW_CUSTOM_WILDCARD=true` is explicitly set. In development, wildcards are unrestricted for local exploration. Source: `src/lib/proxy-guard.server.ts`.

---

## First Launch and Onboarding

### Onboarding Flow

Edgecase Cockpit includes a guided onboarding experience for new users. For V1, onboarding should foreground the user-configured generic local OpenAI-compatible endpoint path; cloud provider setup is secondary infrastructure.

1. **Welcome Screen**: Explains what Edgecase Cockpit is and its purpose
2. **Local endpoint configuration**: Start with the generic local OpenAI-compatible endpoint path
3. **Local capability setup**: Get clear instructions for base URL/model configuration and the safe model-list action

Onboarding can be completed or skipped at any time (via the **Skip for Now** button or the close control).

### Onboarding State

- Onboarding completion is stored in `localStorage` under `cockpit.settings.v2.onboardingCompleted`
- Once completed, onboarding will not reappear unless explicitly reset
- Users can skip onboarding and access it later through settings if needed

### Resetting Onboarding

To reset onboarding for testing or if a user wants to see it again:

```javascript
import { store } from "@/lib/cockpit-store";
store.resetOnboarding();
```

### Provider Configuration

The V1 onboarding path guides users to:

1. **Detect or configure local capability** for the generic local OpenAI-compatible endpoint
2. **Configure the base URL** for the local endpoint
3. **List models** through the safe bounded model-list action
4. **Recover from unavailable/misconfigured states** without needing cloud keys, OAuth, live provider accounts, signed native builds, marketplace scope, unrelated agent infrastructure, or an account

All provider configuration is done through the standard Settings interface.

---

## 12. Provider Setup and Validation

### Overview

Edgecase Cockpit now provides clear, user-friendly feedback for provider setup and API key validation. This helps you understand which providers are ready to use and troubleshoot any configuration issues.

### Provider Status Indicators

In the Settings page, each provider card shows one of these statuses:

- **✅ Ready to chat** (green) - Provider is fully configured and validated
- **⚠️ Needs validation** (amber) - API key is set but not yet validated
- **🔑 Needs API key** (amber) - No API key configured
- **🔧 Configure base URL** (amber) - Local provider needs URL setup

### Validation Status

After entering an API key, you can validate it:

1. **Click "Validate" button** (shield icon) in the provider card
2. Status changes to "Validating..." (blue) while checking
3. Results show as:
   - **✅ Valid** (green shield) - Key is working
   - **❌ Invalid key** (red shield) - Authentication failed
   - **⚠️ Validation error** (amber shield) - Network or other issue

### Validation Messages

- **"API key is valid"** - Your key works and can be used for chat
- **"Invalid API key"** - The key was rejected by the provider
- **"Failed to validate key"** - The validation request returned an error
- **"Network error during validation"** - Cannot connect to the validation endpoint
- **"No API key set to validate"** - Enter a key first

### Toast Notifications

When validation completes, you'll see toast notifications:

- ✅ **"✅ OpenAI API key is valid!"** - Success
- ❌ **"❌ OpenAI: Invalid API key"** - Failure with reason

### Model Selection Feedback

The model picker shows:

- **"Loading models..."** - Fetching available models
- **"✅ X models available"** - Models loaded successfully
- **"⚠️ Failed to fetch models (using default)"** - Fallback to default model

### Troubleshooting

**"Invalid API key" errors:**

1. Double-check your API key
2. Ensure it hasn't expired
3. Verify you have sufficient credits/quota
4. Check the provider's status page

**"Network error" or "Timeout":**

1. Check your internet connection
2. Verify the provider is not down
3. For local providers, ensure your daemon is running
4. Try again later

**"No models available":**

1. The provider may not support model listing
2. Using the default model is fine
3. Chat functionality still works

### Provider Status in Chat

The status bar shows:

- **✅ Provider (model) Ready** - Validated and working
- **⚠️ Provider needs setup** - Missing key or configuration
- **❌ Provider invalid key** - Validation failed

Click the status bar to go directly to Settings and fix any issues.

---

## Troubleshooting

### Error and Offline States

#### 1. Missing API Key

**Message:** "No API key set for [Provider]. Add one in Settings."

**What happened:** You tried to use a provider without setting up an API key.

**What to do:**

1. Click the "Settings" button or navigate to `/settings`
2. Find the provider card (e.g., OpenAI, Anthropic)
3. Enter your API key
4. Click "Save"

#### 2. Invalid API Key

**Message:** "Your API key for [Provider] is invalid. Update it in Settings."

**What happened:** The API key you provided is incorrect, revoked, or expired.

**What to do:**

1. Click the "Settings" button or navigate to `/settings`
2. Find the provider card
3. Verify your API key is correct
4. Update it if needed
5. Click "Save"

#### 3. Provider Unavailable

**Message:** "[Provider] is unavailable. Check your connection or try again."

**What happened:** The provider's server is unreachable (connection refused, timeout, or offline).

**What to do:**

1. Check your internet connection
2. If using a local provider (e.g., Ollama, LM Studio), verify the daemon is running
3. Click "Retry" to attempt the request again
4. If the issue persists, check the provider's status page

#### 4. Rate Limited

**Message:** "You've been rate limited by [Provider]. Try again in X seconds."

**What happened:** You've sent too many requests in a short time and the provider is throttling you.

**What to do:**

1. Wait for the countdown to complete (X seconds)
2. Click **Retry** to resend the request once the cooldown expires
3. If you need to cancel, click "Cancel"
4. Consider upgrading your plan if you frequently hit rate limits

#### 5. Offline Mode

**Message:** "You're offline. Messages will send when you reconnect."

**What happened:** Your device is offline, but your message has been queued.

**What to do:**

1. Check your internet connection
2. Once reconnected, your queued messages will automatically send
3. You'll see a success message when they're sent

**Status bar:** Shows "You're offline — X messages queued" with the queue count.

#### 6. Offline Message Synced

**Message:** "Your queued messages have been sent."

**What happened:** Your device reconnected and queued messages were successfully sent.

**What to do:** No action needed. Your messages are now delivered.

#### 7. Storage Failure

**Message:** "Message could not be saved. Free up space or try again."

**What happened:** Your browser's localStorage is full or unavailable.

**What to do:**

1. Clear some browser data (cache, cookies, or localStorage)
2. Try again
3. If using private/incognito mode, switch to a regular browser session
4. Check your browser's storage settings
