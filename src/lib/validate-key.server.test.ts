import { describe, it, expect, vi } from "vitest";
import { PROVIDERS } from "@/lib/providers";
import { validateProviderKey } from "@/lib/validate-key.server";

describe("validateProviderKey SSRF allowlist", () => {
  it("refuses to fetch a baseUrl that is not allowlisted for the provider", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const openai = PROVIDERS.find((p) => p.id === "openai")!;

    const result = await validateProviderKey(openai, "sk-test", "http://169.254.169.254");

    expect(result).toEqual({ valid: false, error: "host_not_allowed" });
    expect(fetchSpy, "an unallowlisted host must never reach fetch").not.toHaveBeenCalled();
  });
});
