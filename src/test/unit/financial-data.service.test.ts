// @vitest-environment node
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { makeTestDb } from "../helpers";
import { FinancialDataService } from "@/lib/services/financial-data";
import { SettingsService } from "@/lib/services/settings";
import * as schema from "@/lib/db/schema";
import type { PriceResult } from "@/lib/providers/types";
import type { ProviderName } from "@/lib/providers/types";
import type { ProviderFactory } from "@/lib/services/financial-data";

// ─── Mock providers ───────────────────────────────────────────────────────────

function makeRateProvider(name: ProviderName, rate: number | null) {
  return {
    name,
    getPrice: vi.fn(
      async (symbol: string, currency: string, date?: string): Promise<PriceResult | null> => {
        if (rate === null) return null;
        return { symbol, currency, price: rate, date: date ?? "2026-03-20", provider: name };
      }
    ),
    getPrices: vi.fn(async (symbol: string, date?: string): Promise<PriceResult[]> => {
      if (rate === null) return [];
      return [{ symbol, currency: "EUR", price: rate, date: date ?? "2026-03-20", provider: name }];
    }),
  };
}

function makePriceProvider(name: ProviderName, price: number | null) {
  return {
    name,
    getPrice: vi.fn(
      async (symbol: string, currency: string, date?: string): Promise<PriceResult | null> => {
        if (price === null) return null;
        return { symbol, price, currency, date: date ?? "2026-03-20", provider: name };
      }
    ),
  };
}

/** Create a factory that returns the given mock provider for its name. */
function mockFactory(
  ...providers: Array<{ name: ProviderName; [key: string]: unknown }>
): ProviderFactory {
  const map = new Map(providers.map((p) => [p.name, p]));
  return (name: ProviderName) => (map.get(name) as ReturnType<ProviderFactory>) ?? null;
}

// ─── Service under test ───────────────────────────────────────────────────────

let service: FinancialDataService;
let settingsService: SettingsService;

beforeEach(() => {
  const db = makeTestDb();
  settingsService = new SettingsService(db);
  service = new FinancialDataService(db, settingsService);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Cache behaviour ──────────────────────────────────────────────────────────

describe("getPrice — caching (exchange rates)", () => {
  it("caches and returns a rate on second call without hitting provider again", async () => {
    const provider = makeRateProvider("frankfurter", 0.92);
    const db = makeTestDb();
    const svc = new FinancialDataService(db, new SettingsService(db), mockFactory(provider));

    const first = await svc.getPrice({ frankfurter: "USD" }, "EUR", "2026-01-15");
    const second = await svc.getPrice({ frankfurter: "USD" }, "EUR", "2026-01-15");

    expect(first?.price).toBeCloseTo(0.92);
    expect(second?.price).toBeCloseTo(0.92);
    // Provider should only have been called once (cache hit on second call)
    expect(provider.getPrice).toHaveBeenCalledTimes(1);
  });

  it("historical rates are cached indefinitely", async () => {
    const provider = makeRateProvider("frankfurter", 0.9);
    const db = makeTestDb();
    const svc = new FinancialDataService(db, new SettingsService(db), mockFactory(provider));

    await svc.getPrice({ frankfurter: "USD" }, "EUR", "2020-06-01");
    await svc.getPrice({ frankfurter: "USD" }, "EUR", "2020-06-01");

    expect(provider.getPrice).toHaveBeenCalledTimes(1);
  });
});

describe("getPrice — provider fallback", () => {
  it("tries next provider when first returns null", async () => {
    const failingProvider = makeRateProvider("frankfurter", null);
    const goodProvider = makeRateProvider("ecb", 0.85);
    const db = makeTestDb();
    const svc = new FinancialDataService(
      db,
      new SettingsService(db),
      mockFactory(failingProvider, goodProvider)
    );

    const result = await svc.getPrice({ frankfurter: "USD", ecb: "USD" }, "EUR", "2026-03-01");
    expect(result?.price).toBeCloseTo(0.85);
    expect(result?.provider).toBe("ecb");
    expect(failingProvider.getPrice).toHaveBeenCalledTimes(1);
    expect(goodProvider.getPrice).toHaveBeenCalledTimes(1);
  });

  it("returns null when all providers fail and no cache", async () => {
    const failingProvider = makeRateProvider("frankfurter", null);
    const db = makeTestDb();
    const svc = new FinancialDataService(db, new SettingsService(db), mockFactory(failingProvider));

    const result = await svc.getPrice({ frankfurter: "USD" }, "EUR", "2026-03-01");
    expect(result).toBeNull();
  });

  it("returns stale cached result when all providers fail", async () => {
    const provider = makeRateProvider("frankfurter", 0.91);
    const db = makeTestDb();
    const svc = new FinancialDataService(db, new SettingsService(db), mockFactory(provider));

    // First call: prime the cache
    await svc.getPrice({ frankfurter: "USD" }, "EUR", "2026-03-01");

    // Second call: provider now fails
    provider.getPrice.mockResolvedValue(null);
    const result = await svc.getPrice({ frankfurter: "USD" }, "EUR", "2026-03-01");
    // Historical date → always hits cache (immutable), so stale flag is false here
    expect(result).not.toBeNull();
    expect(result?.price).toBeCloseTo(0.91);
  });

  it("skips providers not in the symbolMap", async () => {
    const frankfurter = makeRateProvider("frankfurter", 0.92);
    const ecb = makeRateProvider("ecb", 0.93);
    const db = makeTestDb();
    const svc = new FinancialDataService(
      db,
      new SettingsService(db),
      mockFactory(frankfurter, ecb)
    );

    // Only pass ecb in the symbolMap
    const result = await svc.getPrice({ ecb: "USD" }, "EUR", "2026-03-01");
    expect(result?.price).toBeCloseTo(0.93);
    expect(result?.provider).toBe("ecb");
    expect(frankfurter.getPrice).not.toHaveBeenCalled();
    expect(ecb.getPrice).toHaveBeenCalledTimes(1);
  });

  it("skips provider when factory returns null (missing API key)", async () => {
    const db = makeTestDb();
    const svc = new FinancialDataService(db, new SettingsService(db), () => null);

    const result = await svc.getPrice({ "alpha-vantage": "AAPL" }, "USD", "2026-03-01");
    expect(result).toBeNull();
  });
});

// ─── convert ──────────────────────────────────────────────────────────────────

describe("convert", () => {
  it("converts same currency with no API call", async () => {
    const result = await service.convert(10, "EUR", "EUR", {});
    expect(result?.converted).toBe(10);
    expect(result?.rate).toBe(1);
  });

  it("converts amount using exchange rate", async () => {
    const provider = makeRateProvider("frankfurter", 0.92);
    const db = makeTestDb();
    const svc = new FinancialDataService(db, new SettingsService(db), mockFactory(provider));

    const result = await svc.convert(100, "USD", "EUR", { frankfurter: "USD" }, "2026-01-15");
    expect(result?.converted).toBe(92); // 100 * 0.92
    expect(result?.rate).toBeCloseTo(0.92);
  });

  it("returns null when no rate is available", async () => {
    const failProvider = makeRateProvider("frankfurter", null);
    const db = makeTestDb();
    const svc = new FinancialDataService(db, new SettingsService(db), mockFactory(failProvider));

    const result = await svc.convert(10, "USD", "EUR", { frankfurter: "USD" });
    expect(result).toBeNull();
  });
});

// ─── getPrice (market prices) ───────────────────────────────────────────────

describe("getPrice — caching (market prices)", () => {
  it("caches and returns a price on second call", async () => {
    const provider = makePriceProvider("coingecko", 85000.0);
    const db = makeTestDb();
    const svc = new FinancialDataService(db, new SettingsService(db), mockFactory(provider));

    const first = await svc.getPrice({ coingecko: "bitcoin" }, "EUR", "2026-01-15");
    const second = await svc.getPrice({ coingecko: "bitcoin" }, "EUR", "2026-01-15");

    expect(first?.price).toBeCloseTo(85000);
    expect(second?.price).toBeCloseTo(85000);
    expect(provider.getPrice).toHaveBeenCalledTimes(1);
  });
});

// ─── Stale cache & error paths ─────────────────────────────────────────────────

describe("getPrice — stale cache and provider errors", () => {
  it("returns stale cache when today's price is expired and provider throws", async () => {
    const provider = makeRateProvider("frankfurter", 0.91);
    const db = makeTestDb();
    const svc = new FinancialDataService(db, new SettingsService(db), mockFactory(provider));

    // Prime the cache with today's date
    const today = new Date().toISOString().slice(0, 10);
    await svc.getPrice({ frankfurter: "USD" }, "EUR", today);

    // Make the cached entry look old by directly updating fetchedAt
    db.update(schema.marketPrices).set({ fetchedAt: "2020-01-01T00:00:00.000Z" }).run();

    // Provider now throws
    provider.getPrice.mockRejectedValue(new Error("network error"));
    const result = await svc.getPrice({ frankfurter: "USD" }, "EUR", today);

    expect(result).not.toBeNull();
    expect(result?.price).toBeCloseTo(0.91);
    expect(result?.stale).toBe(true);
  });

  it("handles provider throwing an exception gracefully", async () => {
    const provider = makeRateProvider("frankfurter", 0.92);
    provider.getPrice.mockRejectedValue(new Error("timeout"));
    const db = makeTestDb();
    const svc = new FinancialDataService(db, new SettingsService(db), mockFactory(provider));

    const result = await svc.getPrice({ frankfurter: "USD" }, "EUR", "2026-03-01");
    expect(result).toBeNull();
  });

  it("skips symbol that matches the target currency", async () => {
    const provider = makeRateProvider("frankfurter", 1.0);
    const db = makeTestDb();
    const svc = new FinancialDataService(db, new SettingsService(db), mockFactory(provider));

    // Symbol "EUR" with currency "EUR" should be skipped
    const result = await svc.getPrice({ frankfurter: "EUR" }, "EUR", "2026-03-01");
    expect(result).toBeNull();
    expect(provider.getPrice).not.toHaveBeenCalled();
  });
});

// ─── getPrices ────────────────────────────────────────────────────────────────

describe("getPrices", () => {
  it("returns prices from the first provider that succeeds", async () => {
    const provider = makeRateProvider("frankfurter", 0.92);
    const db = makeTestDb();
    const svc = new FinancialDataService(db, new SettingsService(db), mockFactory(provider));

    const results = await svc.getPrices({ frankfurter: "USD" }, "2026-03-01");
    expect(results).toHaveLength(1);
    expect(results[0].price).toBeCloseTo(0.92);
    expect(results[0].stale).toBe(false);
  });

  it("caches all prices returned by getPrices", async () => {
    const provider = {
      name: "frankfurter" as ProviderName,
      getPrices: vi.fn(
        async (): Promise<PriceResult[]> => [
          {
            symbol: "USD",
            currency: "EUR",
            price: 0.92,
            date: "2026-03-01",
            provider: "frankfurter",
          },
          {
            symbol: "USD",
            currency: "GBP",
            price: 0.79,
            date: "2026-03-01",
            provider: "frankfurter",
          },
        ]
      ),
    };
    const db = makeTestDb();
    const svc = new FinancialDataService(db, new SettingsService(db), mockFactory(provider));

    const results = await svc.getPrices({ frankfurter: "USD" }, "2026-03-01");
    expect(results).toHaveLength(2);

    // Verify they were cached
    const cached = db.select().from(schema.marketPrices).all();
    expect(cached).toHaveLength(2);
  });

  it("returns empty array when provider returns empty", async () => {
    const provider = makeRateProvider("frankfurter", null);
    const db = makeTestDb();
    const svc = new FinancialDataService(db, new SettingsService(db), mockFactory(provider));

    const results = await svc.getPrices({ frankfurter: "USD" }, "2026-03-01");
    expect(results).toEqual([]);
  });

  it("returns empty array when provider throws", async () => {
    const provider = {
      name: "frankfurter" as ProviderName,
      getPrices: vi.fn(async () => {
        throw new Error("network error");
      }),
    };
    const db = makeTestDb();
    const svc = new FinancialDataService(db, new SettingsService(db), mockFactory(provider));

    const results = await svc.getPrices({ frankfurter: "USD" }, "2026-03-01");
    expect(results).toEqual([]);
  });

  it("skips provider without getPrices method", async () => {
    const provider = makePriceProvider("coingecko", 85000);
    const db = makeTestDb();
    const svc = new FinancialDataService(db, new SettingsService(db), mockFactory(provider));

    const results = await svc.getPrices({ coingecko: "bitcoin" }, "2026-03-01");
    expect(results).toEqual([]);
  });
});

// ─── ensurePriceHistory ───────────────────────────────────────────────────────

describe("ensurePriceHistory", () => {
  it("backfills missing price history from provider", async () => {
    const provider = {
      name: "frankfurter" as ProviderName,
      getPriceRange: vi.fn(
        async (): Promise<PriceResult[]> => [
          {
            symbol: "USD",
            currency: "EUR",
            price: 0.91,
            date: "2026-03-01",
            provider: "frankfurter",
          },
          {
            symbol: "USD",
            currency: "EUR",
            price: 0.92,
            date: "2026-03-02",
            provider: "frankfurter",
          },
          {
            symbol: "USD",
            currency: "EUR",
            price: 0.93,
            date: "2026-03-03",
            provider: "frankfurter",
          },
        ]
      ),
    };
    const db = makeTestDb();
    const svc = new FinancialDataService(db, new SettingsService(db), mockFactory(provider));

    await svc.ensurePriceHistory({ frankfurter: "USD" }, "EUR", "2026-03-01", "2026-03-03");

    const cached = db.select().from(schema.marketPrices).all();
    expect(cached).toHaveLength(3);
    expect(provider.getPriceRange).toHaveBeenCalledWith("USD", "EUR", "2026-03-01", "2026-03-03");
  });

  it("skips backfill when cache is >80% populated", async () => {
    const provider = {
      name: "frankfurter" as ProviderName,
      getPriceRange: vi.fn(async (): Promise<PriceResult[]> => []),
    };
    const db = makeTestDb();
    const svc = new FinancialDataService(db, new SettingsService(db), mockFactory(provider));

    // Pre-populate cache with 3 out of 3 days (100% > 80%)
    for (const d of ["2026-03-01", "2026-03-02", "2026-03-03"]) {
      db.insert(schema.marketPrices)
        .values({ symbol: "USD", currency: "EUR", price: 0.92, date: d, provider: "frankfurter" })
        .run();
    }

    await svc.ensurePriceHistory({ frankfurter: "USD" }, "EUR", "2026-03-01", "2026-03-03");
    expect(provider.getPriceRange).not.toHaveBeenCalled();
  });

  it("skips already-cached dates during backfill", async () => {
    const provider = {
      name: "frankfurter" as ProviderName,
      getPriceRange: vi.fn(
        async (): Promise<PriceResult[]> => [
          {
            symbol: "USD",
            currency: "EUR",
            price: 0.91,
            date: "2026-03-01",
            provider: "frankfurter",
          },
          {
            symbol: "USD",
            currency: "EUR",
            price: 0.92,
            date: "2026-03-02",
            provider: "frankfurter",
          },
        ]
      ),
    };
    const db = makeTestDb();
    const svc = new FinancialDataService(db, new SettingsService(db), mockFactory(provider));

    // Pre-populate one day
    db.insert(schema.marketPrices)
      .values({
        symbol: "USD",
        currency: "EUR",
        price: 0.9,
        date: "2026-03-01",
        provider: "frankfurter",
      })
      .run();

    // Range is 5 days, only 1 cached = 20% < 80%, so it will backfill
    await svc.ensurePriceHistory({ frankfurter: "USD" }, "EUR", "2026-03-01", "2026-03-05");

    // The provider returned 2 results; the one for 03-01 was already cached
    // so only 03-02 should be freshly inserted (03-01 gets upserted via cachePrice)
    const cached = db.select().from(schema.marketPrices).all();
    expect(cached.length).toBeGreaterThanOrEqual(2);
  });

  it("handles provider getPriceRange throwing", async () => {
    const provider = {
      name: "frankfurter" as ProviderName,
      getPriceRange: vi.fn(async () => {
        throw new Error("API down");
      }),
    };
    const db = makeTestDb();
    const svc = new FinancialDataService(db, new SettingsService(db), mockFactory(provider));

    // Should not throw
    await svc.ensurePriceHistory({ frankfurter: "USD" }, "EUR", "2026-03-01", "2026-03-05");
    const cached = db.select().from(schema.marketPrices).all();
    expect(cached).toHaveLength(0);
  });

  it("skips symbol that matches the target currency", async () => {
    const provider = {
      name: "frankfurter" as ProviderName,
      getPriceRange: vi.fn(async (): Promise<PriceResult[]> => []),
    };
    const db = makeTestDb();
    const svc = new FinancialDataService(db, new SettingsService(db), mockFactory(provider));

    await svc.ensurePriceHistory({ frankfurter: "EUR" }, "EUR", "2026-03-01", "2026-03-05");
    expect(provider.getPriceRange).not.toHaveBeenCalled();
  });

  it("skips provider without getPriceRange method", async () => {
    const provider = makePriceProvider("coingecko", 85000);
    const db = makeTestDb();
    const svc = new FinancialDataService(db, new SettingsService(db), mockFactory(provider));

    await svc.ensurePriceHistory({ coingecko: "bitcoin" }, "EUR", "2026-03-01", "2026-03-05");
    // Should complete without error, no prices cached
    const cached = db.select().from(schema.marketPrices).all();
    expect(cached).toHaveLength(0);
  });
});

// ─── searchSymbol ─────────────────────────────────────────────────────────────

describe("searchSymbol", () => {
  it("aggregates results from all providers with searchSymbol", async () => {
    const db = makeTestDb();
    const settings = new SettingsService(db);

    // Mock getProvidersByAssetType
    vi.spyOn(await import("@/lib/providers/registry"), "getProvidersByAssetType").mockReturnValue([
      {
        name: "coingecko",
        searchSymbol: vi.fn(async () => [
          {
            provider: "coingecko" as ProviderName,
            symbol: "bitcoin",
            name: "Bitcoin",
            type: "crypto",
          },
        ]),
      },
      {
        name: "alpha-vantage",
        searchSymbol: vi.fn(async () => [
          {
            provider: "alpha-vantage" as ProviderName,
            symbol: "BTC-USD",
            name: "Bitcoin USD",
            type: "crypto",
          },
        ]),
      },
    ] as unknown as ReturnType<typeof import("@/lib/providers/registry").getProvidersByAssetType>);

    const svc = new FinancialDataService(db, settings);
    const results = await svc.searchSymbol("bitcoin");

    expect(results).toHaveLength(2);
    expect(results[0].symbol).toBe("bitcoin");
    expect(results[1].symbol).toBe("BTC-USD");
  });

  it("handles provider search failure gracefully", async () => {
    const db = makeTestDb();
    const settings = new SettingsService(db);

    vi.spyOn(await import("@/lib/providers/registry"), "getProvidersByAssetType").mockReturnValue([
      {
        name: "coingecko",
        searchSymbol: vi.fn(async () => {
          throw new Error("API error");
        }),
      },
      {
        name: "alpha-vantage",
        searchSymbol: vi.fn(async () => [
          {
            provider: "alpha-vantage" as ProviderName,
            symbol: "AAPL",
            name: "Apple Inc",
            type: "stock",
          },
        ]),
      },
    ] as unknown as ReturnType<typeof import("@/lib/providers/registry").getProvidersByAssetType>);

    const svc = new FinancialDataService(db, settings);
    const results = await svc.searchSymbol("apple");

    // Should still return results from the working provider
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe("AAPL");
  });

  it("skips providers without searchSymbol method", async () => {
    const db = makeTestDb();
    const settings = new SettingsService(db);

    vi.spyOn(await import("@/lib/providers/registry"), "getProvidersByAssetType").mockReturnValue([
      { name: "frankfurter" },
      {
        name: "coingecko",
        searchSymbol: vi.fn(async () => [
          { provider: "coingecko" as ProviderName, symbol: "bitcoin", name: "Bitcoin" },
        ]),
      },
    ] as unknown as ReturnType<typeof import("@/lib/providers/registry").getProvidersByAssetType>);

    const svc = new FinancialDataService(db, settings);
    const results = await svc.searchSymbol("bitcoin");

    expect(results).toHaveLength(1);
  });
});

// ─── searchSymbolStream ──────────────────────────────────────────────────────

describe("searchSymbolStream", () => {
  it("yields results per-provider in completion order", async () => {
    const db = makeTestDb();
    const settings = new SettingsService(db);

    vi.spyOn(await import("@/lib/providers/registry"), "getProvidersByAssetType").mockReturnValue([
      {
        name: "coingecko",
        searchSymbol: vi.fn(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () =>
                  resolve([
                    {
                      provider: "coingecko" as ProviderName,
                      symbol: "bitcoin",
                      name: "Bitcoin",
                      type: "crypto",
                    },
                  ]),
                50
              )
            )
        ),
      },
      {
        name: "alpha-vantage",
        searchSymbol: vi.fn(async () => [
          {
            provider: "alpha-vantage" as ProviderName,
            symbol: "BTC",
            name: "BTC USD",
            type: "crypto",
          },
        ]),
      },
    ] as unknown as ReturnType<typeof import("@/lib/providers/registry").getProvidersByAssetType>);

    const svc = new FinancialDataService(db, settings);
    const batches: Array<{ provider: string; results: unknown[] }> = [];
    for await (const batch of svc.searchSymbolStream("bitcoin")) {
      batches.push(batch);
    }

    expect(batches).toHaveLength(2);
    // alpha-vantage resolves instantly, coingecko after 50ms
    expect(batches[0].provider).toBe("alpha-vantage");
    expect(batches[1].provider).toBe("coingecko");
  });

  it("skips providers that return empty results", async () => {
    const db = makeTestDb();
    const settings = new SettingsService(db);

    vi.spyOn(await import("@/lib/providers/registry"), "getProvidersByAssetType").mockReturnValue([
      {
        name: "coingecko",
        searchSymbol: vi.fn(async () => []),
      },
      {
        name: "alpha-vantage",
        searchSymbol: vi.fn(async () => [
          {
            provider: "alpha-vantage" as ProviderName,
            symbol: "AAPL",
            name: "Apple",
            type: "stock",
          },
        ]),
      },
    ] as unknown as ReturnType<typeof import("@/lib/providers/registry").getProvidersByAssetType>);

    const svc = new FinancialDataService(db, settings);
    const batches: Array<{ provider: string; results: unknown[] }> = [];
    for await (const batch of svc.searchSymbolStream("apple")) {
      batches.push(batch);
    }

    expect(batches).toHaveLength(1);
    expect(batches[0].provider).toBe("alpha-vantage");
  });

  it("handles provider failure gracefully", async () => {
    const db = makeTestDb();
    const settings = new SettingsService(db);

    vi.spyOn(await import("@/lib/providers/registry"), "getProvidersByAssetType").mockReturnValue([
      {
        name: "coingecko",
        searchSymbol: vi.fn(async () => {
          throw new Error("API error");
        }),
      },
      {
        name: "alpha-vantage",
        searchSymbol: vi.fn(async () => [
          {
            provider: "alpha-vantage" as ProviderName,
            symbol: "AAPL",
            name: "Apple",
            type: "stock",
          },
        ]),
      },
    ] as unknown as ReturnType<typeof import("@/lib/providers/registry").getProvidersByAssetType>);

    const svc = new FinancialDataService(db, settings);
    const batches: Array<{ provider: string; results: unknown[] }> = [];
    for await (const batch of svc.searchSymbolStream("apple")) {
      batches.push(batch);
    }

    expect(batches).toHaveLength(1);
    expect(batches[0].provider).toBe("alpha-vantage");
  });
});

// ─── API key management ────────────────────────────────────────────────────────

describe("setApiKey / getApiKey", () => {
  it("stores and retrieves an API key", () => {
    service.setApiKey("coingecko", "test-key-123");
    expect(service.getApiKey("coingecko")).toBe("test-key-123");
  });

  it("returns null for provider with no key", () => {
    expect(service.getApiKey("alpha-vantage")).toBeNull();
  });
});

// ─── FX Backfill ──────────────────────────────────────────────────────────────

describe("backfillTransactionRates", () => {
  it("fetches rates only for non-base transaction (date, currency) pairs missing from cache", async () => {
    const db = makeTestDb({ baseCurrency: "EUR" });
    const provider = makeRateProvider("frankfurter", 0.92);
    const svc = new FinancialDataService(
      db,
      new SettingsService(db),
      mockFactory(provider, makeRateProvider("fawazahmed", null))
    );

    // Two USD transactions on dates >7 days apart so the second can't
    // benefit from the first's cached rate (the cache lookup window is
    // 7 days). One EUR transaction is dropped because it's the base.
    db.insert(schema.transactions)
      .values([
        {
          amount: 10,
          currency: "USD",
          amountBase: 9.2,
          type: "expense",
          description: "USD a",
          date: "2026-01-15",
        },
        {
          amount: 20,
          currency: "USD",
          amountBase: 18.4,
          type: "expense",
          description: "USD b",
          date: "2026-03-15",
        },
        {
          amount: 50,
          currency: "EUR",
          amountBase: 50,
          type: "expense",
          description: "EUR base",
          date: "2026-03-03",
        },
      ])
      .run();

    const result = await svc.backfillTransactionRates();
    expect(result.pairs).toBe(2);
    expect(result.fetched).toBe(2);
    expect(provider.getPrice).toHaveBeenCalledTimes(2);
  });

  it("regression: skips base-currency transactions entirely", async () => {
    // Pre-fix this could fall through to a no-op fetch loop on every cron
    // run; verify the SQL filter excludes them up front.
    const db = makeTestDb({ baseCurrency: "EUR" });
    const provider = makeRateProvider("frankfurter", 0.92);
    const svc = new FinancialDataService(
      db,
      new SettingsService(db),
      mockFactory(provider, makeRateProvider("fawazahmed", null))
    );

    db.insert(schema.transactions)
      .values({
        amount: 100,
        currency: "EUR",
        amountBase: 100,
        type: "expense",
        description: "EUR only",
        date: "2026-03-01",
      })
      .run();

    const result = await svc.backfillTransactionRates();
    expect(result.pairs).toBe(0);
    expect(result.fetched).toBe(0);
    expect(provider.getPrice).not.toHaveBeenCalled();
  });
});

describe("backfillAssetCurrencyRates", () => {
  it("regression: refreshes today's rate for every distinct foreign-currency asset", async () => {
    // Catches the gap where opening lots create assets without transactions —
    // backfillTransactionRates wouldn't see them, and once their lot-date
    // rate aged out of the 7-day window the read paths silently dropped
    // them from net-worth/allocation/exposure totals.
    const db = makeTestDb({ baseCurrency: "EUR" });
    const provider = makeRateProvider("frankfurter", 1.1);
    const svc = new FinancialDataService(
      db,
      new SettingsService(db),
      mockFactory(provider, makeRateProvider("fawazahmed", null))
    );

    // One EUR asset (skipped — base currency), two USD assets (one currency
    // bucket — distinct), one GBP asset (second bucket).
    db.insert(schema.assets)
      .values([
        { name: "EUR Cash", type: "deposit", currency: "EUR" },
        { name: "US Stock A", type: "investment", currency: "USD" },
        { name: "US Stock B", type: "investment", currency: "USD" },
        { name: "UK Stock", type: "investment", currency: "GBP" },
      ])
      .run();

    const result = await svc.backfillAssetCurrencyRates();
    // 2 distinct foreign currencies: USD and GBP. EUR (the base) is skipped.
    expect(result.currencies).toBe(2);
    expect(result.fetched).toBe(2);
    expect(provider.getPrice).toHaveBeenCalledTimes(2);

    const calls = provider.getPrice.mock.calls.map((c) => c[0]);
    expect(calls).toContain("USD");
    expect(calls).toContain("GBP");
  });

  it("returns 0 when there are no foreign-currency assets", async () => {
    const db = makeTestDb({ baseCurrency: "EUR" });
    const provider = makeRateProvider("frankfurter", 1.1);
    const svc = new FinancialDataService(
      db,
      new SettingsService(db),
      mockFactory(provider, makeRateProvider("fawazahmed", null))
    );

    db.insert(schema.assets)
      .values([{ name: "EUR Cash", type: "deposit", currency: "EUR" }])
      .run();

    const result = await svc.backfillAssetCurrencyRates();
    expect(result.currencies).toBe(0);
    expect(result.fetched).toBe(0);
    expect(provider.getPrice).not.toHaveBeenCalled();
  });
});
