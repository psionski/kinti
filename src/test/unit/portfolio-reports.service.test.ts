// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb } from "../helpers";
import { AssetService } from "@/lib/services/assets";
import { AssetLotService } from "@/lib/services/asset-lots";
import { AssetPriceService } from "@/lib/services/asset-prices";
import { PortfolioReportService } from "@/lib/services/portfolio-reports";
import { TransactionService } from "@/lib/services/transactions";
import { ReportService } from "@/lib/services/reports";
import { FinancialDataService } from "@/lib/services/financial-data";
import { SettingsService } from "@/lib/services/settings";
import { isoToday } from "@/lib/date-ranges";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import { marketPrices } from "@/lib/db/schema";
import type { ProviderName, PriceResult } from "@/lib/providers/types";

/** Seed a market_prices row so synchronous read paths can find an FX rate. */
function seedFxRate(
  database: BetterSQLite3Database<typeof schema>,
  from: string,
  to: string,
  rate: number,
  date: string
): void {
  database
    .insert(marketPrices)
    .values({
      symbol: from,
      currency: to,
      price: rate,
      date,
      provider: "frankfurter",
    })
    .run();
}

let db: BetterSQLite3Database<typeof schema>;
let assetService: AssetService;
let lotService: AssetLotService;
let priceService: AssetPriceService;
let reportService: PortfolioReportService;
let txService: TransactionService;
let spendingReportService: ReportService;

/** Mock FX provider returning a fixed 1.10 rate. Sufficient for tests that
 *  exercise foreign-currency assets without hitting the network. */
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
  const fx = makeFx(db);
  assetService = new AssetService(db);
  lotService = new AssetLotService(db, fx);
  priceService = new AssetPriceService(db);
  reportService = new PortfolioReportService(db);
  txService = new TransactionService(db, fx);
  spendingReportService = new ReportService(db);
});

// ─── Asset Performance ──────────────────────────────────────────────────────

describe("getAssetPerformance", async () => {
  it("returns empty array when no assets", async () => {
    const result = reportService.getAssetPerformance();
    expect(result).toHaveLength(0);
  });

  it("computes performance for a single asset with buy and price snapshot", async () => {
    const asset = assetService.create({ name: "SPX", type: "investment", currency: "EUR" });
    await lotService.buy(asset.id, { quantity: 10, pricePerUnit: 300, date: "2026-01-15" });
    priceService.record(asset.id, { pricePerUnit: 350, recordedAt: `${isoToday()}T10:00:00Z` });

    const result = reportService.getAssetPerformance();
    expect(result).toHaveLength(1);

    const item = result[0];
    expect(item.assetId).toBe(asset.id);
    expect(item.costBasis).toBe(3000); // 10 * 300
    expect(item.currentValue).toBe(3500); // 10 * 350
    expect(item.pnl).toBe(500);
    expect(item.pnlPct).toBeGreaterThan(0);
    expect(item.daysHeld).toBeGreaterThan(0);
  });

  it("sorts by P&L descending", async () => {
    const a1 = assetService.create({ name: "Winner", type: "crypto", currency: "EUR" });
    await lotService.buy(a1.id, { quantity: 1, pricePerUnit: 100, date: "2026-01-01" });
    priceService.record(a1.id, { pricePerUnit: 200, recordedAt: `${isoToday()}T00:00:00Z` });

    const a2 = assetService.create({ name: "Loser", type: "crypto", currency: "EUR" });
    await lotService.buy(a2.id, { quantity: 1, pricePerUnit: 200, date: "2026-01-01" });
    priceService.record(a2.id, { pricePerUnit: 150, recordedAt: `${isoToday()}T00:00:00Z` });

    const result = reportService.getAssetPerformance();
    expect(result[0].name).toBe("Winner");
    expect(result[1].name).toBe("Loser");
  });
});

// ─── Allocation ─────────────────────────────────────────────────────────────

describe("getAllocation", async () => {
  it("returns empty allocation when no assets", async () => {
    const result = reportService.getAllocation();
    expect(result.byAsset).toHaveLength(0);
    expect(result.byType).toHaveLength(0);
  });

  it("computes allocation percentages for multiple assets", async () => {
    const a1 = assetService.create({ name: "Savings", type: "deposit", currency: "EUR" });
    await lotService.buy(a1.id, { quantity: 1000, pricePerUnit: 1, date: "2026-01-01" });

    const a2 = assetService.create({ name: "BTC", type: "crypto", currency: "EUR" });
    await lotService.buy(a2.id, { quantity: 1, pricePerUnit: 100, date: "2026-01-01" });
    priceService.record(a2.id, { pricePerUnit: 100, recordedAt: `${isoToday()}T00:00:00Z` });

    const result = reportService.getAllocation();
    expect(result.byAsset).toHaveLength(2);

    // Total should be 1000 (savings) + 100 (BTC) = 1100
    const totalPct = result.byAsset.reduce((s, a) => s + a.pct, 0);
    // Percentages should sum roughly to 100
    expect(totalPct).toBeCloseTo(100, 0);
  });

  it("groups by type", async () => {
    const a1 = assetService.create({ name: "Savings", type: "deposit", currency: "EUR" });
    await lotService.buy(a1.id, { quantity: 1000, pricePerUnit: 1, date: "2026-01-01" });

    const a2 = assetService.create({ name: "Emergency", type: "deposit", currency: "EUR" });
    await lotService.buy(a2.id, { quantity: 500, pricePerUnit: 1, date: "2026-01-01" });

    const result = reportService.getAllocation();
    expect(result.byType).toHaveLength(1);
    expect(result.byType[0].type).toBe("deposit");
    expect(result.byType[0].pct).toBe(100);
  });
});

// ─── Currency Exposure ──────────────────────────────────────────────────────

describe("getCurrencyExposure", async () => {
  it("returns empty when no assets", async () => {
    expect(reportService.getCurrencyExposure()).toHaveLength(0);
  });

  it("groups assets by native currency, sums values in base currency", async () => {
    const a1 = assetService.create({ name: "EUR Savings", type: "deposit", currency: "EUR" });
    await lotService.buy(a1.id, { quantity: 1000, pricePerUnit: 1, date: "2026-01-01" });

    const a2 = assetService.create({ name: "USD Account", type: "deposit", currency: "USD" });
    await lotService.buy(a2.id, { quantity: 500, pricePerUnit: 1, date: "2026-01-01" });

    // Pre-cache today's USD→EUR rate so the read path can convert. In production
    // the 04:00 cron seeds this; in tests we mirror it.
    seedFxRate(db, "USD", "EUR", 1.1, isoToday());

    const result = reportService.getCurrencyExposure();
    expect(result).toHaveLength(2);

    const eur = result.find((r) => r.currency === "EUR");
    const usd = result.find((r) => r.currency === "USD");
    expect(eur).toBeDefined();
    expect(usd).toBeDefined();
    // Both bucket values are denominated in EUR (the base):
    //   EUR: 1000 × 1 × 1   = 1000
    //   USD: 500  × 1 × 1.1 =  550
    expect(eur!.value).toBeCloseTo(1000, 2);
    expect(usd!.value).toBeCloseTo(550, 2);
    // Pcts are computed against the base-denominated total (1550), so they
    // sum to 100 even with a multi-currency portfolio.
    expect(eur!.pct + usd!.pct).toBeCloseTo(100, 1);
  });

  // Regression: pre-fix this method summed *native* amounts, so a USD asset
  // would compete on equal footing with an EUR asset of the same magnitude
  // even though 500 USD ≠ 500 EUR. Drop foreign assets without a cached FX
  // rate rather than mixing units.
  it("regression: foreign-currency assets without a cached FX rate are skipped", async () => {
    const a1 = assetService.create({ name: "EUR Savings", type: "deposit", currency: "EUR" });
    await lotService.buy(a1.id, { quantity: 1000, pricePerUnit: 1, date: "2026-01-01" });

    const a2 = assetService.create({ name: "USD Account", type: "deposit", currency: "USD" });
    await lotService.buy(a2.id, { quantity: 500, pricePerUnit: 1, date: "2026-01-01" });
    // Deliberately do NOT seed a USD→EUR rate.

    const result = reportService.getCurrencyExposure();
    // USD bucket is dropped — only EUR remains.
    expect(result).toHaveLength(1);
    expect(result[0].currency).toBe("EUR");
    expect(result[0].pct).toBe(100);
  });
});

// ─── Realized P&L ───────────────────────────────────────────────────────────

describe("getRealizedPnL", async () => {
  it("returns empty when no sells", async () => {
    const asset = assetService.create({ name: "ETF", type: "investment", currency: "EUR" });
    await lotService.buy(asset.id, { quantity: 10, pricePerUnit: 100, date: "2026-01-01" });

    const result = reportService.getRealizedPnL();
    expect(result.items).toHaveLength(0);
    expect(result.totalRealizedPnl).toBe(0);
  });

  it("computes FIFO realized P&L from sells", async () => {
    const asset = assetService.create({ name: "BTC", type: "crypto", currency: "EUR" });
    // Buy 2 at 100
    await lotService.buy(asset.id, { quantity: 2, pricePerUnit: 100, date: "2026-01-01" });
    // Sell 1 at 150
    await lotService.sell(asset.id, { quantity: 1, pricePerUnit: 150, date: "2026-02-01" });

    const result = reportService.getRealizedPnL();
    expect(result.items).toHaveLength(1);
    expect(result.items[0].totalSold).toBe(1);
    expect(result.items[0].proceeds).toBe(150); // 1 * 150
    expect(result.items[0].costBasis).toBe(100); // FIFO: first lot @ 100
    expect(result.items[0].realizedPnl).toBe(50);
    expect(result.totalRealizedPnl).toBe(50);
  });

  it("filters by date range", async () => {
    const asset = assetService.create({ name: "ETF", type: "investment", currency: "EUR" });
    await lotService.buy(asset.id, { quantity: 10, pricePerUnit: 100, date: "2026-01-01" });
    await lotService.sell(asset.id, { quantity: 5, pricePerUnit: 120, date: "2026-02-15" });
    await lotService.sell(asset.id, { quantity: 3, pricePerUnit: 130, date: "2026-03-15" });

    // Only March sells
    const result = reportService.getRealizedPnL("2026-03-01", "2026-03-31");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].totalSold).toBe(3);
  });
});

// ─── Asset History ──────────────────────────────────────────────────────────

describe("getAssetHistory", async () => {
  it("returns null for non-existent asset", async () => {
    expect(reportService.getAssetHistory(999, "6m")).toBeNull();
  });

  it("returns lot timeline and value points", async () => {
    const asset = assetService.create({ name: "SPX", type: "investment", currency: "EUR" });
    await lotService.buy(asset.id, { quantity: 5, pricePerUnit: 300, date: "2026-01-15" });
    await lotService.buy(asset.id, { quantity: 3, pricePerUnit: 310, date: "2026-02-15" });
    priceService.record(asset.id, { pricePerUnit: 320, recordedAt: `${isoToday()}T00:00:00Z` });

    const result = reportService.getAssetHistory(asset.id, "all");
    expect(result).not.toBeNull();
    expect(result!.lots).toHaveLength(2);
    expect(result!.lots[0].type).toBe("buy");
    expect(result!.lots[0].runningQuantity).toBe(5);
    expect(result!.lots[1].runningQuantity).toBe(8);
    expect(result!.timeline.length).toBeGreaterThan(0);
  });

  it("'all' window starts from earliest lot, not year 2000", async () => {
    const asset = assetService.create({ name: "ETF", type: "investment", currency: "EUR" });
    await lotService.buy(asset.id, { quantity: 10, pricePerUnit: 100, date: "2025-06-15" });

    const result = reportService.getAssetHistory(asset.id, "all");
    expect(result).not.toBeNull();
    // Timeline should start near the first lot date, not 2000-01-01
    expect(result!.timeline[0].date >= "2025-06-01").toBe(true);
    expect(result!.timeline[0].date < "2025-07-01").toBe(true);
  });

  it("tracks buys and sells in lot timeline with correct running quantity", async () => {
    const asset = assetService.create({ name: "BTC", type: "crypto", currency: "EUR" });
    await lotService.buy(asset.id, { quantity: 10, pricePerUnit: 500, date: "2026-01-10" });
    await lotService.buy(asset.id, { quantity: 5, pricePerUnit: 550, date: "2026-01-20" });
    await lotService.sell(asset.id, { quantity: 3, pricePerUnit: 600, date: "2026-02-15" });

    const result = reportService.getAssetHistory(asset.id, "all");
    expect(result).not.toBeNull();
    expect(result!.lots).toHaveLength(3);

    expect(result!.lots[0].type).toBe("buy");
    expect(result!.lots[0].runningQuantity).toBe(10);

    expect(result!.lots[1].type).toBe("buy");
    expect(result!.lots[1].runningQuantity).toBe(15);

    expect(result!.lots[2].type).toBe("sell");
    expect(result!.lots[2].quantity).toBe(3);
    expect(result!.lots[2].runningQuantity).toBe(12);
  });

  it("timeline value reflects holdings * price at each point", async () => {
    const asset = assetService.create({ name: "ETF", type: "investment", currency: "EUR" });
    await lotService.buy(asset.id, { quantity: 10, pricePerUnit: 100, date: "2026-01-15" });
    // Record a price so resolvePrice has data
    priceService.record(asset.id, { pricePerUnit: 120, recordedAt: `${isoToday()}T00:00:00Z` });

    const result = reportService.getAssetHistory(asset.id, "all");
    expect(result).not.toBeNull();

    // The last timeline point should reflect current holdings * current price
    const last = result!.timeline[result!.timeline.length - 1];
    expect(last.quantity).toBe(10);
    expect(last.price).toBe(120);
    expect(last.value).toBe(1200); // 10 * 120
  });
});

// ─── Transfer Summary ───────────────────────────────────────────────────────

describe("getTransferSummary", async () => {
  it("returns empty for months with no transfers", async () => {
    const result = reportService.getTransferSummary("2026-01");
    expect(result).toHaveLength(0);
  });

  it("groups purchases and sales by asset for a month", async () => {
    const a1 = assetService.create({ name: "ETF", type: "investment", currency: "EUR" });
    await lotService.buy(a1.id, { quantity: 5, pricePerUnit: 100, date: "2026-03-01" });
    await lotService.buy(a1.id, { quantity: 3, pricePerUnit: 105, date: "2026-03-15" });

    const result = reportService.getTransferSummary("2026-03");
    expect(result).toHaveLength(1);
    expect(result[0].assetId).toBe(a1.id);
    expect(result[0].purchases).toBe(500 + 315); // 5*100 + 3*105
    expect(result[0].sales).toBe(0);
  });
});

// ─── Net Worth Time Series ──────────────────────────────────────────────────

describe("getNetWorthTimeSeries", async () => {
  it("returns time series with cash and asset values", async () => {
    await txService.create({
      amount: 5000,
      type: "income",
      description: "Salary",
      date: "2026-01-01",
    });

    const asset = assetService.create({ name: "Savings", type: "deposit", currency: "EUR" });
    await lotService.buy(asset.id, { quantity: 2000, pricePerUnit: 1, date: "2026-01-15" });

    const result = reportService.getNetWorthTimeSeries("all", "monthly");
    expect(result.length).toBeGreaterThan(0);

    // The last point should show cash + assets = net worth
    const last = result[result.length - 1];
    expect(last.total).toBe(last.cash + last.assets);
  });

  it("returns single point for empty portfolio", async () => {
    const result = reportService.getNetWorthTimeSeries("3m", "monthly");
    expect(result.length).toBeGreaterThan(0);
    // All zeros
    for (const point of result) {
      expect(point.cash).toBe(0);
      expect(point.assets).toBe(0);
      expect(point.total).toBe(0);
    }
  });

  it("computes cumulative cash correctly across date points", async () => {
    // Income in Jan, expense in Feb — cash should accumulate
    await txService.create({
      amount: 1000,
      type: "income",
      description: "Jan salary",
      date: "2026-01-15",
    });
    await txService.create({
      amount: 200,
      type: "expense",
      description: "Feb rent",
      date: "2026-02-15",
    });

    const result = reportService.getNetWorthTimeSeries("all", "monthly");
    // Find points after each transaction
    const afterJan = result.find((p) => p.date >= "2026-01-15" && p.date < "2026-02-15");
    const afterFeb = result.find((p) => p.date >= "2026-02-15");
    expect(afterJan).toBeDefined();
    expect(afterFeb).toBeDefined();
    // After Jan income: cash = 1000
    expect(afterJan!.cash).toBe(1000);
    // After Feb expense: cash = 1000 - 200 = 800
    expect(afterFeb!.cash).toBe(800);
  });

  it("tracks multiple assets with different prices", async () => {
    const etf = assetService.create({ name: "ETF", type: "investment", currency: "EUR" });
    const btc = assetService.create({ name: "BTC", type: "crypto", currency: "EUR" });

    await lotService.buy(etf.id, { quantity: 10, pricePerUnit: 100, date: "2026-01-15" });
    await lotService.buy(btc.id, { quantity: 2, pricePerUnit: 500, date: "2026-01-20" });

    // Record prices for today
    priceService.record(etf.id, { pricePerUnit: 120, recordedAt: `${isoToday()}T00:00:00Z` });
    priceService.record(btc.id, { pricePerUnit: 600, recordedAt: `${isoToday()}T00:00:00Z` });

    const result = reportService.getNetWorthTimeSeries("all", "monthly");
    const last = result[result.length - 1];

    // ETF: 10 * 120 = 1200, BTC: 2 * 600 = 1200
    expect(last.assets).toBe(2400);
  });

  it("handles sells reducing holdings in time series", async () => {
    const asset = assetService.create({ name: "ETF", type: "investment", currency: "EUR" });
    await lotService.buy(asset.id, { quantity: 10, pricePerUnit: 100, date: "2026-01-15" });
    await lotService.sell(asset.id, { quantity: 5, pricePerUnit: 120, date: "2026-02-15" });

    priceService.record(asset.id, { pricePerUnit: 120, recordedAt: `${isoToday()}T00:00:00Z` });

    const result = reportService.getNetWorthTimeSeries("all", "monthly");
    const last = result[result.length - 1];

    // After sell: 5 remaining * 120 = 600
    expect(last.assets).toBe(600);
  });

  it("cash-only scenario excludes asset component", async () => {
    await txService.create({
      amount: 3000,
      type: "income",
      description: "Salary",
      date: "2026-01-15",
    });
    await txService.create({
      amount: 500,
      type: "expense",
      description: "Rent",
      date: "2026-02-01",
    });

    const result = reportService.getNetWorthTimeSeries("all", "monthly");
    const last = result[result.length - 1];

    expect(last.assets).toBe(0);
    expect(last.cash).toBe(2500);
    expect(last.total).toBe(2500);
  });

  it("date points are returned in ascending order", async () => {
    await txService.create({
      amount: 1000,
      type: "income",
      description: "Salary",
      date: "2026-01-01",
    });
    const result = reportService.getNetWorthTimeSeries("6m", "monthly");
    const dates = result.map((p) => p.date);
    expect(dates).toEqual([...dates].sort());
  });
});

// ─── Multi-currency regressions ─────────────────────────────────────────────
//
// Pre-fix, getNetWorthTimeSeries, getAllocation, getRealizedPnL, and
// getTransferSummary all summed `transactions.amount` and `assetLots.pricePerUnit`
// in native currency space and produced unit-mixed totals when assets/transactions
// were in different currencies. These tests pin the corrected behaviour.

describe("multi-currency regressions", async () => {
  it("getNetWorthTimeSeries: cash sums amount_base across currencies", async () => {
    // Mock FX returns 1.10 for any non-self pair, so a $500 USD income converts
    // to €550 amount_base. Pre-fix runningCash += row.amount would have
    // produced 1000+500 = 1500 (unit-mixed).
    await txService.create({
      amount: 1000,
      currency: "EUR",
      type: "income",
      description: "EUR salary",
      date: "2026-01-15",
    });
    await txService.create({
      amount: 500,
      currency: "USD",
      type: "income",
      description: "USD bonus",
      date: "2026-01-15",
    });

    const result = reportService.getNetWorthTimeSeries("3m", "monthly");
    const last = result[result.length - 1];
    // 1000 (EUR native) + 500 × 1.10 (USD→EUR base) = 1550
    expect(last.cash).toBeCloseTo(1550, 2);
    expect(last.assets).toBe(0);
    expect(last.total).toBeCloseTo(1550, 2);
  });

  it("getNetWorthTimeSeries: skips foreign assets when FX rate is missing", async () => {
    const usdAsset = assetService.create({
      name: "USD Stock",
      type: "investment",
      currency: "USD",
    });
    await lotService.buy(usdAsset.id, { quantity: 10, pricePerUnit: 100, date: "2026-01-15" });
    // Lot creation pre-caches the rate for the lot date — wipe market_prices to
    // simulate a clean miss for every date point that follows.
    db.delete(marketPrices).run();

    const result = reportService.getNetWorthTimeSeries("3m", "monthly");
    const last = result[result.length - 1];
    // Cash holds the buy's negative amountBase (rate=1.10): -10 × 100 × 1.10 = -1100.
    // Asset value is 0 because no FX rate is cached on any date point.
    expect(last.assets).toBe(0);
    expect(last.cash).toBeCloseTo(-1100, 2);
  });

  it("getAllocation: converts foreign asset values to base before bucketing", async () => {
    const eurAsset = assetService.create({
      name: "EUR Cash",
      type: "deposit",
      currency: "EUR",
    });
    await lotService.buy(eurAsset.id, { quantity: 1000, pricePerUnit: 1, date: "2026-01-01" });

    const usdAsset = assetService.create({
      name: "USD Stock",
      type: "investment",
      currency: "USD",
    });
    await lotService.buy(usdAsset.id, { quantity: 10, pricePerUnit: 100, date: "2026-01-01" });
    seedFxRate(db, "USD", "EUR", 1.1, isoToday());
    priceService.record(usdAsset.id, {
      pricePerUnit: 100,
      recordedAt: `${isoToday()}T00:00:00Z`,
    });

    const result = reportService.getAllocation();
    expect(result.currency).toBe("EUR");
    // EUR: 1000, USD: 10 × 100 × 1.10 = 1100. Total = 2100.
    const eur = result.byAsset.find((a) => a.name === "EUR Cash");
    const usd = result.byAsset.find((a) => a.name === "USD Stock");
    expect(eur?.currentValue).toBeCloseTo(1000, 2);
    expect(usd?.currentValue).toBeCloseTo(1100, 2);
    // Pcts: EUR ≈ 47.6%, USD ≈ 52.4%
    expect(eur!.pct + usd!.pct).toBeCloseTo(100, 1);
    expect(usd!.pct).toBeGreaterThan(eur!.pct);
  });

  it("getRealizedPnL: proceeds and cost basis are summed in base currency", async () => {
    const usdAsset = assetService.create({
      name: "USD Stock",
      type: "investment",
      currency: "USD",
    });
    // Buy 2 at $100, sell 1 at $150. Mock FX is 1.10 throughout.
    await lotService.buy(usdAsset.id, { quantity: 2, pricePerUnit: 100, date: "2026-01-01" });
    await lotService.sell(usdAsset.id, { quantity: 1, pricePerUnit: 150, date: "2026-02-01" });

    const result = reportService.getRealizedPnL();
    expect(result.currency).toBe("EUR");
    expect(result.items).toHaveLength(1);

    const item = result.items[0];
    expect(item.currency).toBe("USD");
    // Native: 1 × 150 proceeds, 1 × 100 cost, $50 P&L
    expect(item.proceeds).toBeCloseTo(150, 2);
    expect(item.costBasis).toBeCloseTo(100, 2);
    expect(item.realizedPnl).toBeCloseTo(50, 2);
    // Base (constant rate 1.10): 165 proceeds, 110 cost, €55 P&L
    expect(item.proceedsBase).toBeCloseTo(165, 2);
    expect(item.costBasisBase).toBeCloseTo(110, 2);
    expect(item.realizedPnlBase).toBeCloseTo(55, 2);
    // Totals roll up base-denominated.
    expect(result.totalProceeds).toBeCloseTo(165, 2);
    expect(result.totalCostBasis).toBeCloseTo(110, 2);
    expect(result.totalRealizedPnl).toBeCloseTo(55, 2);
  });

  it("getTransferSummary: aggregates amount_base across currencies", async () => {
    const usdAsset = assetService.create({
      name: "USD Stock",
      type: "investment",
      currency: "USD",
    });
    await lotService.buy(usdAsset.id, { quantity: 5, pricePerUnit: 100, date: "2026-03-10" });

    const result = reportService.getTransferSummary("2026-03");
    expect(result).toHaveLength(1);
    // Native total = $500 → €550 at the mock rate
    expect(result[0].purchases).toBeCloseTo(550, 2);
    expect(result[0].sales).toBe(0);
    expect(result[0].net).toBeCloseTo(550, 2);
  });
});

// ─── Spending Summary with includeTransfers ─────────────────────────────────

describe("spendingSummary includeTransfers", async () => {
  it("includes transfers section when flag is true", async () => {
    await txService.create({
      amount: 5000,
      type: "income",
      description: "Salary",
      date: "2026-03-01",
    });
    await txService.create({
      amount: 300,
      type: "expense",
      description: "Rent",
      date: "2026-03-05",
    });

    const asset = assetService.create({ name: "ETF", type: "investment", currency: "EUR" });
    await lotService.buy(asset.id, { quantity: 5, pricePerUnit: 100, date: "2026-03-10" });

    const result = spendingReportService.spendingSummary({
      dateFrom: "2026-03-01",
      dateTo: "2026-03-31",
      groupBy: "category",
      type: "expense",
      includeTransfers: true,
    });

    expect(result.transfers).toBeDefined();
    expect(result.transfers!).toHaveLength(1);
    expect(result.transfers![0].assetName).toBe("ETF");
    expect(result.transfers![0].purchases).toBe(500);
  });

  it("omits transfers when flag is false", async () => {
    const result = spendingReportService.spendingSummary({
      dateFrom: "2026-03-01",
      dateTo: "2026-03-31",
      groupBy: "category",
      type: "expense",
      includeTransfers: false,
    });

    expect(result.transfers).toBeUndefined();
  });
});
