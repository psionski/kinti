// @vitest-environment node
//
// Price resolution, told as the situations a user actually lands in.
//
// The unit tests in price-resolver.test.ts pin the resolver's branches. These
// go through the services a user's clicks go through — create an asset, buy it,
// let a quote arrive, set a price by hand — and assert the number that ends up
// on screen. The bug that motivated them (a buy price outranking every later
// quote, permanently) was invisible to branch-level tests because every branch
// worked exactly as written; it was the *ordering between* them that was wrong.
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { sql } from "drizzle-orm";
import { makeTestDb } from "../helpers";
import { AssetService } from "@/lib/services/assets";
import { AssetLotService } from "@/lib/services/asset-lots";
import { AssetPriceService } from "@/lib/services/asset-prices";
import { FinancialDataService } from "@/lib/services/financial-data";
import { PortfolioReportService } from "@/lib/services/portfolio-reports";
import { SettingsService } from "@/lib/services/settings";
import { resolvePrice } from "@/lib/services/price-resolver";
import { assetPrices, marketPrices } from "@/lib/db/schema";
import { isoToday, offsetDate } from "@/lib/date-ranges";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import type { ProviderName, PriceResult } from "@/lib/providers/types";
import type { AssetResponse } from "@/lib/validators/assets";

let db: BetterSQLite3Database<typeof schema>;
let assets: AssetService;
let lots: AssetLotService;
let prices: AssetPriceService;
let reports: PortfolioReportService;

const TODAY = isoToday();
const daysAgo = (n: number): string => offsetDate(TODAY, -n);

/** FX stub — these stories are single-currency unless they say otherwise. */
function makeFx(database: typeof db): FinancialDataService {
  return new FinancialDataService(
    database,
    new SettingsService(database),
    (name: ProviderName) => ({
      name,
      getPrice: async (symbol: string, currency: string, date?: string): Promise<PriceResult> => ({
        symbol,
        currency,
        price: 1.1,
        date: date ?? TODAY,
        provider: name,
      }),
    })
  );
}

/** A quote landing in the cache, as the nightly refresh would leave it. */
function quote(symbol: string, price: number, date: string, currency = "EUR"): void {
  db.insert(marketPrices)
    .values({ symbol, price, currency, date, provider: "alpha-vantage" })
    .run();
}

function linkedEtf(name = "WEBN"): AssetResponse {
  return assets.create({
    name,
    type: "investment",
    currency: "EUR",
    symbolMap: { "alpha-vantage": name },
  });
}

beforeEach(() => {
  db = makeTestDb();
  assets = new AssetService(db);
  lots = new AssetLotService(db, makeFx(db));
  prices = new AssetPriceService(db);
  reports = new PortfolioReportService(db);
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Story: I bought an ETF and the market moved", () => {
  // The original bug. The buy is a week old, a fresh quote exists, and the
  // portfolio must show the quote.
  beforeEach(async () => {
    const etf = linkedEtf();
    await lots.buy(etf.id, { quantity: 100, pricePerUnit: 12.77, date: daysAgo(7) });
    quote("WEBN", 12.816, TODAY);
  });

  it("marks the position at the latest quote, not the price I paid", () => {
    const [etf] = assets.list();
    expect(etf!.latestPrice).toBe(12.816);
    expect(etf!.currentValue).toBe(1281.6);
  });

  it("still reports cost basis as the price I actually paid", () => {
    const [etf] = assets.list();
    expect(etf!.costBasis).toBe(1277);
  });

  it("reports the gap between them as unrealized P&L", () => {
    const [etf] = assets.list();
    expect(etf!.pnl).toBeCloseTo(4.6, 2);
  });

  it("does not record the buy as a manual price override", () => {
    // The root cause: buying used to write into asset_prices, which the
    // resolver treated as a deliberate user valuation.
    expect(db.select().from(assetPrices).all()).toHaveLength(0);
  });
});

describe("Story: my fill price wasn't the day's closing price", () => {
  it("values the position at that day's close, not at what I paid", async () => {
    const etf = linkedEtf();
    await lots.buy(etf.id, { quantity: 100, pricePerUnit: 12.77, date: daysAgo(7) });
    quote("WEBN", 12.76, daysAgo(7));

    const resolved = resolvePrice(db, etf, daysAgo(7));
    expect(resolved).toMatchObject({ price: 12.76, source: "market" });
  });

  it("leaves cost basis on the fill price even so", async () => {
    const etf = linkedEtf();
    await lots.buy(etf.id, { quantity: 100, pricePerUnit: 12.77, date: daysAgo(7) });
    quote("WEBN", 12.76, daysAgo(7));

    const [row] = assets.list();
    expect(row!.costBasis).toBe(1277);
  });
});

describe("Story: I set a price by hand", () => {
  it("uses my number over today's quote when I entered it today", async () => {
    const etf = linkedEtf();
    await lots.buy(etf.id, { quantity: 10, pricePerUnit: 12.0, date: daysAgo(30) });
    quote("WEBN", 12.816, TODAY);
    prices.record(etf.id, { pricePerUnit: 13.5 });

    expect(resolvePrice(db, etf)).toMatchObject({ price: 13.5, source: "user" });
  });

  it("goes back to the provider once a newer quote arrives", async () => {
    const etf = linkedEtf();
    await lots.buy(etf.id, { quantity: 10, pricePerUnit: 12.0, date: daysAgo(30) });
    prices.record(etf.id, { pricePerUnit: 13.5, recordedAt: `${daysAgo(5)}T10:00:00` });
    quote("WEBN", 12.816, TODAY);

    // A hand-entered mark is a valuation, not a permanent override — the point
    // of a price feed is that it supersedes stale numbers.
    expect(resolvePrice(db, etf)).toMatchObject({ price: 12.816, source: "market" });
  });

  it("keeps my number while the quote is older than it", async () => {
    const etf = linkedEtf();
    await lots.buy(etf.id, { quantity: 10, pricePerUnit: 12.0, date: daysAgo(30) });
    quote("WEBN", 12.816, daysAgo(4));
    prices.record(etf.id, { pricePerUnit: 13.5, recordedAt: `${daysAgo(2)}T10:00:00` });

    expect(resolvePrice(db, etf)).toMatchObject({ price: 13.5, source: "user" });
  });
});

describe("Story: I own something with no price feed", () => {
  // A car, a flat, a private holding — "Set Price" is the only way to value it.
  it("carries my last valuation forward indefinitely", async () => {
    const car = assets.create({ name: "Car", type: "other", currency: "EUR" });
    await lots.createOpeningLot(car.id, {
      quantity: 1,
      pricePerUnit: 20000,
      date: daysAgo(400),
    });
    prices.record(car.id, { pricePerUnit: 15000, recordedAt: `${daysAgo(200)}T10:00:00` });

    // 200 days later and still the right answer: nothing newer has valued it.
    expect(resolvePrice(db, car)).toMatchObject({ price: 15000, source: "user" });
  });

  it("does not let a later purchase override a newer valuation", async () => {
    const car = assets.create({ name: "Car", type: "other", currency: "EUR" });
    await lots.createOpeningLot(car.id, { quantity: 1, pricePerUnit: 20000, date: daysAgo(400) });
    prices.record(car.id, { pricePerUnit: 15000, recordedAt: `${daysAgo(200)}T10:00:00` });
    await lots.createOpeningLot(car.id, { quantity: 1, pricePerUnit: 9000, date: daysAgo(10) });

    // What you paid for a second unit is a transaction, not an appraisal of
    // what you already hold.
    expect(resolvePrice(db, car)).toMatchObject({ price: 15000, source: "user" });
  });

  it("falls back to what I paid when I have never valued it", async () => {
    const car = assets.create({ name: "Car", type: "other", currency: "EUR" });
    await lots.createOpeningLot(car.id, { quantity: 1, pricePerUnit: 20000, date: daysAgo(400) });

    expect(resolvePrice(db, car)).toMatchObject({ price: 20000, source: "lot" });
  });

  it("reports no price at all when there is nothing to go on", () => {
    const fund = assets.create({ name: "Private Fund", type: "other", currency: "EUR" });
    expect(resolvePrice(db, fund)).toBeNull();
  });
});

describe("Story: the market is closed", () => {
  it("uses the most recent trading day's close over a weekend", async () => {
    const etf = linkedEtf();
    await lots.buy(etf.id, { quantity: 10, pricePerUnit: 12.0, date: daysAgo(30) });
    // Friday's close, then a Saturday and Sunday with no quote at all.
    quote("WEBN", 12.9, daysAgo(2));

    const resolved = resolvePrice(db, etf);
    expect(resolved).toMatchObject({ price: 12.9, source: "market" });
    // The price is honest about which day it belongs to.
    expect(resolved!.asOf).toBe(daysAgo(2));
  });

  it("keeps using the last quote while a provider is briefly unreachable", async () => {
    const etf = linkedEtf();
    await lots.buy(etf.id, { quantity: 10, pricePerUnit: 12.0, date: daysAgo(30) });
    quote("WEBN", 12.9, daysAgo(6));

    expect(resolvePrice(db, etf)).toMatchObject({ price: 12.9, source: "market" });
  });

  it("keeps using the last quote even after the feed has been dead for weeks", async () => {
    const etf = linkedEtf();
    await lots.buy(etf.id, { quantity: 10, pricePerUnit: 12.0, date: daysAgo(30) });
    quote("WEBN", 12.9, daysAgo(8));

    // A broken feed is not a reason to reach for the fill price: the quote is
    // still the most recent thing anyone observed, and the purchase price is
    // both older and not a valuation at all. Discarding it would replace a
    // stale-but-real number with a wrong one.
    expect(resolvePrice(db, etf)).toMatchObject({ price: 12.9, source: "market" });
  });

  it("reports the quote's real date so a stale price can be shown as stale", async () => {
    const etf = linkedEtf();
    await lots.buy(etf.id, { quantity: 10, pricePerUnit: 12.0, date: daysAgo(30) });
    quote("WEBN", 12.9, daysAgo(40));

    expect(resolvePrice(db, etf)).toMatchObject({ asOf: daysAgo(40), source: "market" });
  });

  // The live regression: WEBN's feed stopped updating, its last quote aged past
  // the old 7-day cache window, and the asset page silently switched to the
  // price of the last buy — showing a €34,415 position as though the market had
  // moved to exactly what the user paid.
  it("does not let a newer purchase displace an older quote", async () => {
    const etf = linkedEtf();
    quote("WEBN", 12.816, daysAgo(10));
    await lots.buy(etf.id, { quantity: 10, pricePerUnit: 12.77, date: daysAgo(15) });

    expect(resolvePrice(db, etf)).toMatchObject({ price: 12.816, source: "market" });
  });
});

describe("Story: what I traded at is settled history", () => {
  it("computes realized P&L from my trades, whatever the price does later", async () => {
    const etf = linkedEtf();
    await lots.buy(etf.id, { quantity: 100, pricePerUnit: 10, date: daysAgo(60) });
    await lots.sell(etf.id, { quantity: 40, pricePerUnit: 12, date: daysAgo(30) });

    const before = reports.getRealizedPnL();
    quote("WEBN", 99, TODAY);
    const after = reports.getRealizedPnL();

    expect(before.totalRealizedPnl).toBe(80); // 40 × (12 − 10)
    expect(after.totalRealizedPnl).toBe(before.totalRealizedPnl);
  });

  it("leaves the transaction amounts a buy generated untouched", async () => {
    const etf = linkedEtf();
    const { transaction } = await lots.buy(etf.id, {
      quantity: 100,
      pricePerUnit: 12.77,
      date: daysAgo(7),
    });

    quote("WEBN", 99, TODAY);

    const rows = db.select().from(schema.transactions).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amount).toBe(transaction.amount);
    // Negative: buying moves money out. 100 × 12.77, fixed at write time.
    expect(rows[0]!.amount).toBe(-1277);
  });
});

describe("Story: two prices recorded at the same instant", () => {
  it("always resolves to the same one", () => {
    const etf = linkedEtf();
    // Same timestamp to the second — possible for imported or scripted data.
    // Without a tiebreak SQLite may return either row on any given query.
    db.insert(assetPrices)
      .values([
        { assetId: etf.id, pricePerUnit: 12.76, recordedAt: `${daysAgo(1)}T21:00:00Z` },
        { assetId: etf.id, pricePerUnit: 12.77, recordedAt: `${daysAgo(1)}T21:00:00Z` },
      ])
      .run();

    const seen = new Set(Array.from({ length: 5 }, () => resolvePrice(db, etf)?.price));
    expect(seen).toEqual(new Set([12.77]));
  });
});

describe("Story: upgrading an install that already has trade snapshots", () => {
  // The 0010 migration deletes rows, so its match rule is worth pinning down
  // against data shaped like the live database it was written for.
  const MIGRATION = readFileSync(
    path.resolve(__dirname, "../../../drizzle/0010_price_observations.sql"),
    "utf-8"
  );

  it("clears mirrored fill prices and leaves hand-entered marks alone", () => {
    const etf = linkedEtf();

    // Three fills on one day — the old code mirrored each into asset_prices at
    // local midnight, which is 21:00Z the previous day at UTC+3.
    db.insert(schema.assetLots)
      .values([
        { assetId: etf.id, quantity: 40, pricePerUnit: 12.76, date: "2026-08-21" },
        { assetId: etf.id, quantity: 30, pricePerUnit: 12.77, date: "2026-08-21" },
        { assetId: etf.id, quantity: 30, pricePerUnit: 12.77, date: "2026-08-21" },
      ])
      .run();
    db.insert(assetPrices)
      .values([
        { assetId: etf.id, pricePerUnit: 12.76, recordedAt: "2026-08-20T21:00:00Z" },
        { assetId: etf.id, pricePerUnit: 12.77, recordedAt: "2026-08-20T21:00:00Z" },
        { assetId: etf.id, pricePerUnit: 12.77, recordedAt: "2026-08-20T21:00:00Z" },
        // A mark the user typed, at a price no lot has.
        { assetId: etf.id, pricePerUnit: 13.5, recordedAt: "2026-08-26T19:00:03.352065346Z" },
        // A mark that repeats a fill price but months away from any fill.
        { assetId: etf.id, pricePerUnit: 12.77, recordedAt: "2026-11-02T09:00:00Z" },
      ])
      .run();

    db.run(sql.raw(MIGRATION));

    const remaining = db
      .select({ price: assetPrices.pricePerUnit, at: assetPrices.recordedAt })
      .from(assetPrices)
      .all();

    expect(remaining).toHaveLength(2);
    expect(remaining.map((r) => r.price).sort()).toEqual([12.77, 13.5]);
    expect(remaining.every((r) => !r.at.startsWith("2026-08-20"))).toBe(true);
  });

  it("keeps a mark I typed the day after a trade at the same price", () => {
    // Friday's fill, then on Saturday the user sets the price to the same
    // number by hand. A snapshot's instant is never *later* than its lot's
    // local date, so this can only be a real mark — and it isn't redundant:
    // with Friday's close cached at a different price, dropping the mark would
    // change the number on screen.
    const etf = linkedEtf();
    db.insert(schema.assetLots)
      .values({ assetId: etf.id, quantity: 10, pricePerUnit: 12.77, date: "2026-08-21" })
      .run();
    db.insert(assetPrices)
      .values({ assetId: etf.id, pricePerUnit: 12.77, recordedAt: "2026-08-22T08:00:00Z" })
      .run();

    db.run(sql.raw(MIGRATION));

    expect(db.select().from(assetPrices).all()).toHaveLength(1);
  });

  it("keeps an evening mark from a western timezone", () => {
    // 21:00 in New York on the 21st is stored as 01:00Z on the 22nd, so this
    // row's UTC date is a day *later* than the local day it belongs to — the
    // direction the one-sided window can't see. The midnight test is what
    // excludes it: a mark taken "now" carries sub-second precision, a snapshot
    // never does.
    const etf = linkedEtf();
    db.insert(schema.assetLots)
      .values({ assetId: etf.id, quantity: 10, pricePerUnit: 12.77, date: "2026-08-22" })
      .run();
    db.insert(assetPrices)
      .values({
        assetId: etf.id,
        pricePerUnit: 12.77,
        recordedAt: "2026-08-22T01:00:03.918274611Z",
      })
      .run();

    db.run(sql.raw(MIGRATION));

    expect(db.select().from(assetPrices).all()).toHaveLength(1);
  });

  it("still clears a snapshot whose instant lands on the day before its lot", () => {
    // The eastern-timezone shape: local midnight of 2026-08-21 at UTC+3 is
    // 2026-08-20T21:00:00Z. This one must go.
    const etf = linkedEtf();
    db.insert(schema.assetLots)
      .values({ assetId: etf.id, quantity: 10, pricePerUnit: 12.77, date: "2026-08-21" })
      .run();
    db.insert(assetPrices)
      .values({ assetId: etf.id, pricePerUnit: 12.77, recordedAt: "2026-08-20T21:00:00Z" })
      .run();

    db.run(sql.raw(MIGRATION));

    expect(db.select().from(assetPrices).all()).toHaveLength(0);
  });

  it("leaves an install that never traded completely untouched", () => {
    const car = assets.create({ name: "Car", type: "other", currency: "EUR" });
    db.insert(assetPrices)
      .values([
        { assetId: car.id, pricePerUnit: 20000, recordedAt: "2026-01-05T00:00:00Z" },
        { assetId: car.id, pricePerUnit: 15000, recordedAt: "2026-06-05T00:00:00Z" },
      ])
      .run();

    db.run(sql.raw(MIGRATION));

    expect(db.select().from(assetPrices).all()).toHaveLength(2);
  });
});

describe("Story: the price shown has a date I can check", () => {
  it("reports the day a quote belongs to, not the day it was requested", async () => {
    const etf = linkedEtf();
    await lots.buy(etf.id, { quantity: 10, pricePerUnit: 12.0, date: daysAgo(30) });
    quote("WEBN", 12.9, daysAgo(3));

    expect(resolvePrice(db, etf)!.asOf).toBe(daysAgo(3));
  });

  it("reports the day I recorded a manual mark", () => {
    const car = assets.create({ name: "Car", type: "other", currency: "EUR" });
    prices.record(car.id, { pricePerUnit: 15000, recordedAt: `${daysAgo(30)}T10:00:00` });

    expect(resolvePrice(db, car)!.asOf).toBe(daysAgo(30));
  });

  it("reports the trade date when falling back to cost basis", async () => {
    const car = assets.create({ name: "Car", type: "other", currency: "EUR" });
    await lots.createOpeningLot(car.id, { quantity: 1, pricePerUnit: 20000, date: daysAgo(50) });

    expect(resolvePrice(db, car)!.asOf).toBe(daysAgo(50));
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Story: I keep an account in another currency", () => {
  /** A USD account with the rate the nightly refresh would have cached. */
  function usdAccount(rate: number | null = 0.92): Promise<AssetResponse> {
    const account = assets.create({
      name: "USD Travel Fund",
      type: "deposit",
      currency: "USD",
      symbolMap: { frankfurter: "USD" },
    });
    if (rate !== null) quote("USD", rate, TODAY, "EUR");
    return lots
      .buy(account.id, { quantity: 800, pricePerUnit: 1, date: daysAgo(30) })
      .then(() => account);
  }

  it("says the balance is 800 dollars, whatever the euro is doing", async () => {
    const account = await usdAccount();

    expect(resolvePrice(db, account)).toMatchObject({ price: 1, source: "deposit" });
    expect(assets.getById(account.id)?.currentValue).toBe(800);
  });

  it("converts to euros exactly once", async () => {
    const account = await usdAccount();

    // Not 800 × 0.92 × 0.92 = 677.12, which is what valuing the deposit at its
    // own exchange rate used to produce.
    expect(assets.getById(account.id)?.currentValueBase).toBeCloseTo(736, 2);
  });

  it("shows no gain in dollars, because none of it is a gain in dollars", async () => {
    const account = await usdAccount();

    expect(assets.getById(account.id)?.pnl).toBe(0);
  });

  it("refuses a hand-entered price, since the balance is what changes", async () => {
    const account = await usdAccount();

    expect(() => prices.record(account.id, { pricePerUnit: 0.92 })).toThrow("always 1 USD");
  });

  it("still knows the balance when no rate has ever been cached", async () => {
    const account = await usdAccount(null);

    // The account is worth 800 USD with or without a feed. Only the euro
    // figure needs a rate, and it is the one that goes missing.
    const metrics = assets.getById(account.id);
    expect(metrics?.currentValue).toBe(800);
    expect(metrics?.currentValueBase).toBeNull();
  });

  it("carries the rate on the history, which is the series that moves", async () => {
    const account = await usdAccount();

    const history = reports.getAssetHistory(account.id, "3m");
    const latest = history?.timeline[history.timeline.length - 1];
    // Price pinned at 1 forever; the rate is the only thing that changes what
    // the balance is worth, which is why the detail page charts it instead.
    expect(latest?.price).toBe(1);
    expect(latest?.value).toBe(800);
    expect(latest?.rate).toBeCloseTo(0.92, 4);
  });
});
