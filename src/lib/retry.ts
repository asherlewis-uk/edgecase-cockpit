/**
 * Retry a function with exponential backoff and jitter for transient errors.
 *
 * Default behaviour: retries on network errors (TypeError, "fetch failed") and
 * 5xx HTTP status codes (wrapped as ProviderError with status 502, 503, 504).
 */

export interface RetryOptions {
  /** Maximum number of retries (default 3). */
  maxRetries?: number;
  /** Base delay in milliseconds (default 1000). */
  baseDelay?: number;
  /** Maximum delay in milliseconds (default 30000). */
  maxDelay?: number;
  /** Predicate: return true if the error is worth retrying. */
  shouldRetry?: (error: unknown) => boolean;
}

function defaultShouldRetry(error: unknown): boolean {
  if (error instanceof TypeError) {
    // Network failures (fetch aborted, DNS, etc.)
    return true;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("fetch failed") || msg.includes("network")) return true;
    // ProviderError with 5xx status
    if ("status" in error && typeof (error as { status: number }).status === "number") {
      const status = (error as { status: number }).status;
      if (status >= 500 && status < 600) return true;
    }
  }
  return false;
}

function jitter(delay: number): number {
  // ±15% jitter
  const factor = 0.85 + Math.random() * 0.3;
  return Math.round(delay * factor);
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelay = options?.baseDelay ?? 1000;
  const maxDelay = options?.maxDelay ?? 30000;
  const shouldRetry = options?.shouldRetry ?? defaultShouldRetry;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= maxRetries || !shouldRetry(error)) {
        throw error;
      }

      const delay = jitter(Math.min(baseDelay * 2 ** attempt, maxDelay));
      console.warn(
        `[retryWithBackoff] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delay}ms`,
        error instanceof Error ? error.message : error,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
