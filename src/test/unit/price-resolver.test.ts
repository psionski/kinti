// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb } from "../helpers";
import { AssetService } from "@/lib/services/assets";
import { AssetLotService } from "@/lib/services/asset-lots";
import { AssetPriceService } from "@/lib/services/asset-prices";
import { FinancialDataService } from "@/lib/services/financial-data";
import { SettingsService } from "@/lib/services/settings";
import { resolvePrice } from "@/lib/services/price-resolver";
import { assetLots, assetPrices, marketPrices } from "@/lib/db/schema";
import { isoToday } from "@/lib/date-ranges";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import type { ProviderName, PriceResult } from "@/lib/providers/types";

let db: BetterSQLite3Database<typeof schema>;
let assetService: AssetService;
let lotService: AssetLotService;
let priceService: AssetPriceService;

function makeFx(database: typeof db): FinancialDataService {
  return new FinancialDataService(
    database,
    new SettingsService(database),
    (name: ProviderName) => ({
      name,
      getPrice: async (
        symbol: string,
        currency: string,
        date?: string
      ): Promise<PriceResult | null> => {
        if (symbol === currency) return null;
        return { symbol, currency, price: 1.1, date: date ?? "2026-03-01", provider: name };
      },
    })
  );
}

beforeEach(() => {
  db = makeTestDb();
  assetService = new AssetService(db);
  lotService = new AssetLotService(db, makeFx(db));
  priceService = new AssetPriceService(db);
});

describe("resolvePrice", async () => {
  it("returns user price when asset_prices entry exists near date", async () => {
    const asset = assetService.create({ name: "SPX", type: "investment", currency: "EUR" });
    priceService.record(asset.id, { pricePerUnit: 350, recordedAt: "2026-03-20T10:00:00Z" });

    const result = resolvePrice(db, asset, "2026-03-20");
    expect(result).not.toBeNull();
    expect(result!.price).toBe(350);
    expect(result!.source).toBe("user");
  });

  it("returns market price when asset has symbolMap and market_prices has data", async () => {
    const asset = assetService.create({
      name: "Bitcoin",
      type: "crypto",
      currency: "EUR",
      symbolMap: { coingecko: "bitcoin" },
    });

    db.insert(marketPrices)
      .values({
        symbol: "bitcoin",
        price: 80000.5,
        currency: "EUR",
        date: "2026-03-20",
        provider: "coingecko",
      })
      .run();

    const result = resolvePrice(db, asset, "2026-03-20");
    expect(result).not.toBeNull();
    expect(result!.price).toBe(80000.5);
    expect(result!.source).toBe("market");
  });

  it("user price overrides market price", async () => {
    const asset = assetService.create({
      name: "Bitcoin",
      type: "crypto",
      currency: "EUR",
      symbolMap: { coingecko: "bitcoin" },
    });

    priceService.record(asset.id, { pricePerUnit: 90000, recordedAt: "2026-03-20T12:00:00Z" });
    db.insert(marketPrices)
      .values({
        symbol: "bitcoin",
        price: 80000,
        currency: "EUR",
        date: "2026-03-20",
        provider: "coingecko",
      })
      .run();

    const result = resolvePrice(db, asset, "2026-03-20");
    expect(result!.source).toBe("user");
    expect(result!.price).toBe(90000);
  });

  it("treats a buy price as cost basis, not as a user override", async () => {
    const asset = assetService.create({ name: "ETF", type: "investment", currency: "EUR" });
    await lotService.buy(asset.id, { quantity: 5, pricePerUnit: 100, date: "2026-01-15" });

    // buy() records a lot and nothing else — a fill is what you paid, not a
    // statement about what the asset is worth, so it resolves as "lot" and
    // stays outranked by any quote or hand-entered mark.
    const result = resolvePrice(db, asset, "2026-06-15");
    expect(result).not.toBeNull();
    expect(result!.source).toBe("lot");
    expect(result!.price).toBe(100);
  });

  it("falls back to lot cost basis when no user prices exist", async () => {
    const asset = assetService.create({ name: "ETF", type: "investment", currency: "EUR" });
    db.insert(assetLots)
      .values({ assetId: asset.id, quantity: 5, pricePerUnit: 100, date: "2026-01-15" })
      .run();

    const result = resolvePrice(db, asset, "2026-06-15");
    expect(result).not.toBeNull();
    expect(result!.source).toBe("lot");
    expect(result!.price).toBe(100);
  });

  it("returns deposit identity for deposit assets with no other prices", async () => {
    const asset = assetService.create({ name: "Savings", type: "deposit", currency: "EUR" });

    const result = resolvePrice(db, asset, "2026-03-20");
    expect(result).not.toBeNull();
    expect(result!.price).toBe(1);
    expect(result!.source).toBe("deposit");
  });

  it("returns null for investment with no price data", async () => {
    const asset = assetService.create({ name: "Private Fund", type: "other", currency: "EUR" });

    const result = resolvePrice(db, asset, "2026-03-20");
    expect(result).toBeNull();
  });

  it("market price uses nearest within 7 days", async () => {
    const asset = assetService.create({
      name: "Bitcoin",
      type: "crypto",
      currency: "EUR",
      symbolMap: { coingecko: "bitcoin" },
    });

    db.insert(marketPrices)
      .values({
        symbol: "bitcoin",
        price: 75000,
        currency: "EUR",
        date: "2026-03-15",
        provider: "coingecko",
      })
      .run();

    const result = resolvePrice(db, asset, "2026-03-20");
    expect(result).not.toBeNull();
    expect(result!.source).toBe("market");
    expect(result!.price).toBe(75000);
  });

  it("uses cached price regardless of which provider stored it", async () => {
    const asset = assetService.create({
      name: "Bitcoin",
      type: "crypto",
      currency: "EUR",
      symbolMap: { coingecko: "bitcoin" },
    });

    // Price cached by a different provider — cache key is (symbol, currency, date)
    db.insert(marketPrices)
      .values({
        symbol: "bitcoin",
        price: 99999,
        currency: "EUR",
        date: "2026-03-20",
        provider: "alpha-vantage",
      })
      .run();

    const result = resolvePrice(db, asset, "2026-03-20");
    expect(result?.source).toBe("market");
    expect(result?.price).toBe(99999);
  });

  it("iterates multiple symbols in symbolMap", async () => {
    const asset = assetService.create({
      name: "Bitcoin",
      type: "crypto",
      currency: "EUR",
      symbolMap: { coingecko: "bitcoin", "alpha-vantage": "BTC" },
    });

    // Only alpha-vantage symbol has data
    db.insert(marketPrices)
      .values({
        symbol: "BTC",
        price: 82000,
        currency: "EUR",
        date: "2026-03-20",
        provider: "alpha-vantage",
      })
      .run();

    const result = resolvePrice(db, asset, "2026-03-20");
    expect(result).not.toBeNull();
    expect(result!.source).toBe("market");
    expect(result!.price).toBe(82000);
  });

  // Regression: a `(USD, EUR, 0.86)` row is an exchange rate, not the price of
  // the deposit. Returning it here made `800 USD` resolve to `0.86`, which
  // callers rendered as "$688.35" and then converted to base a *second* time,
  // landing on €592.28 for a balance worth €688.35.
  it("prices a foreign deposit at 1 even when an exchange rate is cached", async () => {
    const asset = assetService.create({
      name: "USD Savings",
      type: "deposit",
      currency: "USD",
      symbolMap: { frankfurter: "USD" },
    });

    db.insert(marketPrices)
      .values({
        symbol: "USD",
        currency: "EUR",
        price: 0.92,
        date: "2026-03-20",
        provider: "frankfurter",
      })
      .run();

    const result = resolvePrice(db, asset, "2026-03-20");
    expect(result).not.toBeNull();
    expect(result!.source).toBe("deposit");
    expect(result!.price).toBe(1);
  });

  // A native-currency quote for a deposit symbol would be a rate of USD to USD.
  // Nothing writes one, but the identity has to hold if something ever did.
  it("prices a foreign deposit at 1 even against a same-currency quote", async () => {
    const asset = assetService.create({
      name: "USD Savings",
      type: "deposit",
      currency: "USD",
      symbolMap: { frankfurter: "USD" },
    });

    db.insert(marketPrices)
      .values({
        symbol: "USD",
        currency: "USD",
        price: 1.07,
        date: "2026-03-20",
        provider: "frankfurter",
      })
      .run();

    expect(resolvePrice(db, asset, "2026-03-20")).toMatchObject({ price: 1, source: "deposit" });
  });

  // A mark on a deposit is rejected at the service boundary, but rows predating
  // that guard survive in the table. The identity outranks them.
  it("prices a deposit at 1 even with a hand-entered mark on file", async () => {
    const asset = assetService.create({ name: "Savings", type: "deposit", currency: "EUR" });

    db.insert(assetPrices)
      .values({ assetId: asset.id, pricePerUnit: 1.5, recordedAt: "2026-03-20T10:00:00Z" })
      .run();

    expect(resolvePrice(db, asset, "2026-03-20")).toMatchObject({ price: 1, source: "deposit" });
  });
});

describe("resolvePrice (no date — defaults to today)", async () => {
  it("returns latest user price when available", async () => {
    const today = isoToday();
    const asset = assetService.create({ name: "SPX", type: "investment", currency: "EUR" });
    priceService.record(asset.id, { pricePerUnit: 300, recordedAt: "2026-01-01T00:00:00Z" });
    priceService.record(asset.id, { pricePerUnit: 350, recordedAt: `${today}T00:00:00Z` });

    const result = resolvePrice(db, asset);
    expect(result!.price).toBe(350);
    expect(result!.source).toBe("user");
  });

  it("returns market price for asset with symbolMap and no user prices", async () => {
    const today = isoToday();
    const asset = assetService.create({
      name: "Bitcoin",
      type: "crypto",
      currency: "EUR",
      symbolMap: { coingecko: "bitcoin" },
    });

    db.insert(marketPrices)
      .values({
        symbol: "bitcoin",
        price: 85000,
        currency: "EUR",
        date: today,
        provider: "coingecko",
      })
      .run();

    const result = resolvePrice(db, asset);
    expect(result).not.toBeNull();
    expect(result!.source).toBe("market");
    expect(result!.price).toBe(85000);
  });

  it("prices a tracked foreign deposit at 1, not at its exchange rate", async () => {
    const today = isoToday();
    const asset = assetService.create({
      name: "GBP Savings",
      type: "deposit",
      currency: "GBP",
      symbolMap: { frankfurter: "GBP" },
    });

    db.insert(marketPrices)
      .values({
        symbol: "GBP",
        currency: "EUR",
        price: 1.17,
        date: today,
        provider: "frankfurter",
      })
      .run();

    const result = resolvePrice(db, asset);
    expect(result).not.toBeNull();
    expect(result!.source).toBe("deposit");
    expect(result!.price).toBe(1);
  });

  it("returns deposit fallback for EUR deposits", async () => {
    const asset = assetService.create({ name: "Savings", type: "deposit", currency: "EUR" });
    const result = resolvePrice(db, asset);
    expect(result!.price).toBe(1);
    expect(result!.source).toBe("deposit");
  });

  // Previously null, which made an untracked foreign account show no value at
  // all. Its balance is knowable without any feed — 800 USD is 800 USD; only
  // the conversion *to base* needs a rate, and that is a separate lookup.
  it("prices a foreign deposit at 1 without a symbolMap", async () => {
    const asset = assetService.create({ name: "USD Fund", type: "deposit", currency: "USD" });
    expect(resolvePrice(db, asset)).toMatchObject({ price: 1, source: "deposit" });
  });
});
