import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getCachedRates, refreshLivePricing } from "./pricing.server";

vi.mock("./platform.server", () => ({
  getDB: vi.fn(),
}));

import { getDB } from "./platform.server";

describe("pricing.server", () => {
  beforeEach(() => {
    vi.mocked(getDB).mockReset();
  });

  it("falls back to static rates when cache is empty", async () => {
    vi.mocked(getDB).mockImplementation(() => {
      throw new Error("D1 not available");
    });
    const rates = await getCachedRates();
    expect(rates.openai.input).toBeGreaterThan(0);
    expect(rates.openai.source).toBe("static");
  });

  it("returns cached rates when present", async () => {
    const mockDb = {
      prepare: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({
          data_json: JSON.stringify({
            openai: { input: 0.001, output: 0.002, source: "live", updatedAt: 1 },
          }),
        }),
      }),
    };
    vi.mocked(getDB).mockReturnValue(mockDb as unknown as ReturnType<typeof getDB>);

    const rates = await getCachedRates();
    expect(rates.openai.input).toBe(0.001);
    expect(rates.openai.source).toBe("live");
  });

  it("refresh returns static rates with metadata", async () => {
    vi.mocked(getDB).mockImplementation(() => {
      throw new Error("D1 not available");
    });
    const result = await refreshLivePricing();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rates.openai.source).toBe("static");
      expect(result.refreshedAt).toBeGreaterThan(0);
    }
  });
});
