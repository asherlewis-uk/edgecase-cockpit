import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { BackendNotConfiguredError, backendFetch } from "@/lib/backend-client.server";

const ORIGIN = "http://127.0.0.1:8000";

describe("backendFetch", () => {
  const original = process.env.BACKEND_ORIGIN;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    delete process.env.BACKEND_ORIGIN;
    fetchSpy = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.BACKEND_ORIGIN;
    } else {
      process.env.BACKEND_ORIGIN = original;
    }
    vi.unstubAllGlobals();
  });

  it("rejects with BackendNotConfiguredError when BACKEND_ORIGIN is unset", async () => {
    await expect(backendFetch("/health", undefined, {})).rejects.toThrow(BackendNotConfiguredError);
  });

  it("states which variable is missing", async () => {
    await expect(backendFetch("/health", undefined, {})).rejects.toThrow(
      "Linux backend is not configured (BACKEND_ORIGIN unset).",
    );
  });

  it("never reaches fetch when unconfigured", async () => {
    await expect(backendFetch("/health", undefined, {})).rejects.toThrow();
    expect(fetchSpy, "an unconfigured backend must never reach fetch").not.toHaveBeenCalled();
  });

  it("builds the URL from the origin and path", async () => {
    await backendFetch("/health", undefined, { BACKEND_ORIGIN: ORIGIN });
    expect(fetchSpy).toHaveBeenCalledWith("http://127.0.0.1:8000/health", undefined);
  });

  it("normalizes the seam when both sides carry a slash", async () => {
    await backendFetch("/health", undefined, { BACKEND_ORIGIN: `${ORIGIN}/` });
    expect(fetchSpy).toHaveBeenCalledWith("http://127.0.0.1:8000/health", undefined);
  });

  it("normalizes the seam when neither side carries a slash", async () => {
    await backendFetch("health", undefined, { BACKEND_ORIGIN: ORIGIN });
    expect(fetchSpy).toHaveBeenCalledWith("http://127.0.0.1:8000/health", undefined);
  });

  it("preserves a base path in the origin", async () => {
    await backendFetch("/health", undefined, { BACKEND_ORIGIN: `${ORIGIN}/api` });
    expect(fetchSpy).toHaveBeenCalledWith("http://127.0.0.1:8000/api/health", undefined);
  });

  it("forwards init to fetch untouched", async () => {
    const init = { method: "POST", body: "{}" };
    await backendFetch("/threads", init, { BACKEND_ORIGIN: ORIGIN });
    expect(fetchSpy).toHaveBeenCalledWith("http://127.0.0.1:8000/threads", init);
  });

  it("falls back to process.env for the origin", async () => {
    process.env.BACKEND_ORIGIN = ORIGIN;
    await backendFetch("/health", undefined, {});
    expect(fetchSpy).toHaveBeenCalledWith("http://127.0.0.1:8000/health", undefined);
  });

  it("cannot be redirected off the configured origin by an absolute path", async () => {
    await backendFetch("http://evil.example/steal", undefined, { BACKEND_ORIGIN: ORIGIN });
    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url.startsWith(ORIGIN), `expected ${url} to stay on ${ORIGIN}`).toBe(true);
  });
});
