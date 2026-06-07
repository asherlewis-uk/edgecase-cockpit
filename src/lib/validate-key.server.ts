import type { ProviderDef } from "./providers";

export type ValidateResult = {
  valid: boolean;
  status?: number;
  error?: string;
};

/**
 * Lightweight API key validation via a GET to the provider's models/chat endpoint.
 * Local providers (authStyle "none") always return valid.
 * Timeout: 5000ms.
 */
export async function validateProviderKey(
  provider: ProviderDef,
  apiKey: string,
  baseUrl?: string,
): Promise<ValidateResult> {
  if (provider.authStyle === "none") {
    return { valid: true };
  }

  const url = buildValidationUrl(provider, baseUrl);
  const headers = buildAuthHeaders(provider, apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    // 401/403 = key rejected; anything else means the key was accepted
    if (res.status === 401 || res.status === 403) {
      return { valid: false, status: res.status, error: "auth_failed" };
    }
    return { valid: true };
  } catch (err: unknown) {
    clearTimeout(timeout);
    if (err instanceof DOMException && err.name === "AbortError") {
      return { valid: false, error: "timeout" };
    }
    const message = err instanceof Error ? err.message : "network_error";
    return { valid: false, error: message };
  }
}

function buildValidationUrl(provider: ProviderDef, baseUrl?: string): string {
  const base = baseUrl || provider.defaultBaseUrl;
  const path = provider.modelsPath || provider.chatPath;
  return `${base}${path}`;
}

function buildAuthHeaders(provider: ProviderDef, apiKey: string): Record<string, string> {
  if (provider.authStyle === "x-api-key") {
    return { "x-api-key": apiKey };
  }
  return { Authorization: `Bearer ${apiKey}` };
}
