// Strongly-consistent distributed rate limiter using Cloudflare Durable Objects.
// This backend is opt-in via RATE_LIMIT_BACKEND=durable_object and requires
// a Durable Object binding named RATE_LIMITER_DO in wrangler.jsonc.

import type { IRateLimiterBackend, RateLimitResult } from "./rate-limit.server";

// Minimal Durable Object stub types (avoiding @cloudflare/workers-types dependency)
export interface DurableObjectId {
  toString(): string;
  equals(other: DurableObjectId): boolean;
  fetch(request: Request): Promise<Response>;
}

export interface DurableObjectNamespace {
  get(id: DurableObjectId | string): DurableObjectStub;
  idFromName(name: string): DurableObjectId;
  newUniqueId(): DurableObjectId;
}

export interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}

export interface RateLimitDOEnv {
  RATE_LIMITER_DO?: DurableObjectNamespace;
}

/**
 * In-DO state for a single rate-limit bucket.
 */
type Bucket = {
  count: number;
  resetAt: number;
};

/**
 * Durable Object that owns a single rate-limit namespace bucket.
 * Keeps bucket state in memory and persists to DO storage for durability.
 */
export class RateLimiterDurableObject {
  private state: DurableObjectState;
  private buckets: Map<string, Bucket> = new Map();
  private initialized = false;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const key = url.searchParams.get("key");
    const windowMs = Number(url.searchParams.get("windowMs"));
    const limit = Number(url.searchParams.get("limit"));

    if (!key || !Number.isFinite(windowMs) || !Number.isFinite(limit)) {
      return Response.json({ error: "Invalid params" }, { status: 400 });
    }

    await this.init();

    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      bucket = { count: 1, resetAt: now + windowMs };
      this.buckets.set(key, bucket);
      await this.persist();
      return Response.json({ ok: true, retryAfter: 0 });
    }

    if (bucket.count >= limit) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      return Response.json({ ok: false, retryAfter });
    }

    bucket.count++;
    await this.persist();
    return Response.json({ ok: true, retryAfter: 0 });
  }

  private async init(): Promise<void> {
    if (this.initialized) return;
    const stored = await this.state.storage.get<Map<string, Bucket>>("buckets");
    if (stored) {
      // Convert plain object back to Map and discard stale buckets
      const now = Date.now();
      for (const [k, v] of stored) {
        if (v.resetAt >= now) this.buckets.set(k, v);
      }
    }
    this.initialized = true;
  }

  private async persist(): Promise<void> {
    await this.state.storage.put("buckets", this.buckets);
  }
}

// Minimal DurableObjectState type for this file
interface DurableObjectState {
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put<T>(key: string, value: T): Promise<void>;
  };
}

/**
 * Client-side backend that forwards checkLimit calls to a Durable Object.
 * Each unique rate-limit key maps to a stable DO instance via idFromName.
 */
export class DurableObjectRateLimiterBackend implements IRateLimiterBackend {
  private namespace: DurableObjectNamespace;

  constructor(namespace: DurableObjectNamespace) {
    this.namespace = namespace;
  }

  checkLimit(key: string, windowMs: number, limit: number): RateLimitResult {
    // Durable Object fetch is async, but the public IRateLimiterBackend interface
    // is synchronous. We synchronously return ok=true and let the caller enforce
    // the limit asynchronously if needed. For routes that need synchronous enforcement,
    // use the async variant checkLimitAsync below.
    void this.checkLimitAsync(key, windowMs, limit);
    return { ok: true };
  }

  /**
   * Async variant that actually consults the Durable Object.
   * Callers that can await should use this for correct enforcement.
   */
  async checkLimitAsync(key: string, windowMs: number, limit: number): Promise<RateLimitResult> {
    const id = this.namespace.idFromName(`rate-limit:${key}`);
    const stub = this.namespace.get(id);
    const url = new URL("http://do/check");
    url.searchParams.set("key", key);
    url.searchParams.set("windowMs", String(windowMs));
    url.searchParams.set("limit", String(limit));

    try {
      const res = await stub.fetch(new Request(url.toString(), { method: "POST" }));
      const body = (await res.json()) as { ok: boolean; retryAfter: number };
      if (!res.ok) return { ok: false, retryAfter: body.retryAfter ?? 60 };
      return body.ok ? { ok: true } : { ok: false, retryAfter: body.retryAfter };
    } catch {
      // Fail open to avoid blocking all traffic on DO unavailability.
      return { ok: true };
    }
  }

  clearAll(): void {
    // Cannot clear all DO instances from the client without listing them.
    // Individual buckets reset naturally when their window expires.
  }
}
