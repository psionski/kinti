// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb } from "../helpers";
import { TransactionService } from "@/lib/services/transactions";
import { CategoryService } from "@/lib/services/categories";
import { ReportService } from "@/lib/services/reports";
import { AssetService } from "@/lib/services/assets";
import { AssetLotService } from "@/lib/services/asset-lots";
import { PortfolioService } from "@/lib/services/portfolio";
import { PortfolioReportService } from "@/lib/services/portfolio-reports";
import { FinancialDataService } from "@/lib/services/financial-data";
import { SettingsService } from "@/lib/services/settings";
import { marketPrices } from "@/lib/db/schema";
import { isoToday } from "@/lib/date-ranges";
import type { ProviderName, PriceResult } from "@/lib/providers/types";

/**
 * End-to-end multi-currency happy path: configure a EUR base, mock the FX
 * provider chain, create a USD transaction, then verify that the row stores
 * the right native + base values, that an aggregated category report rolls
 * up the converted amount, and that asset metrics surface FX vs price P&L
 * correctly.
 *
 * The unit tests cover each layer in isolation; this exercises create →
 * read → aggregate end-to-end with a foreign currency, which is the
 * scenario that's easiest to break in a refactor.
 */

const USD_TO_EUR = 0.92;

function makeFxStub(db: ReturnType<typeof makeTestDb>): FinancialDataService {
  return new FinancialDataService(db, new SettingsService(db), (name: ProviderName) => ({
    name,
    getPrice: async (symbol, currency, date): Promise<PriceResult | null> => {
      // Trivial USD→EUR rate; any other pair returns null so the create-time
      // assertCurrencySupported check will fail loudly if a test accidentally
      // exercises a non-mocked currency.
      if (symbol === "USD" && currency === "EUR") {
        return {
          symbol,
          currency,
          price: USD_TO_EUR,
          date: date ?? "2026-03-01",
          provider: name,
        };
      }
      return null;
    },
  }));
}

describe("Multi-currency end-to-end", () => {
  let db: ReturnType<typeof makeTestDb>;
  let txService: TransactionService;
  let catService: CategoryService;
  let reports: ReportService;
  let assetService: AssetService;
  let lotService: AssetLotService;
  let portfolioService: PortfolioService;
  let portfolioReports: PortfolioReportService;

  beforeEach(() => {
    db = makeTestDb({ baseCurrency: "EUR" });
    const fx = makeFxStub(db);
    txService = new TransactionService(db, fx);
    catService = new CategoryService(db);
    reports = new ReportService(db);
    assetService = new AssetService(db);
    lotService = new AssetLotService(db, fx);
    portfolioService = new PortfolioService(db);
    portfolioReports = new PortfolioReportService(db);
  });

  it("USD transaction → row stores native + amount_base, category report aggregates in EUR", async () => {
    const coffee = catService.create({ name: "Coffee" });

    // Two purchases — one in EUR, one in USD — categorized identically.
    await txService.create({
      amount: 4.5,
      currency: "EUR",
      type: "expense",
      description: "Local cafe",
      categoryId: coffee.id,
      date: "2026-03-05",
    });
    const usdTx = await txService.create({
      amount: 5,
      currency: "USD",
      type: "expense",
      description: "Airport coffee",
      categoryId: coffee.id,
      date: "2026-03-10",
    });

    // Native + base both stored — base = native × stub rate.
    expect(usdTx.amount).toBe(5);
    expect(usdTx.currency).toBe("USD");
    expect(usdTx.amountBase).toBeCloseTo(5 * USD_TO_EUR, 2); // 4.60

    // Category roll-up sums amount_base, so the EUR + USD-converted-to-EUR
    // figures land in the same bucket.
    const { items: catStats, currency: catCurrency } = reports.getCategoryStats({
      month: "2026-03",
      type: "expense",
      includeZeroSpend: false,
      includeUncategorized: false,
    });
    expect(catCurrency).toBe("EUR");
    const coffeeStats = catStats.find((s) => s.categoryId === coffee.id);
    expect(coffeeStats?.total).toBeCloseTo(4.5 + 5 * USD_TO_EUR, 2);

    // Aggregation surfaces label the totals so MCP consumers don't have to
    // ask for the base currency separately.
    const summary = reports.spendingSummary({
      dateFrom: "2026-03-01",
      dateTo: "2026-03-31",
      groupBy: "category",
      type: "expense",
      includeTransfers: false,
    });
    expect(summary.currency).toBe("EUR");
    expect(summary.period.total).toBeCloseTo(4.5 + 5 * USD_TO_EUR, 2);

    const balance = reports.cashBalance();
    expect(balance.currency).toBe("EUR");
    expect(balance.totalExpenses).toBeCloseTo(4.5 + 5 * USD_TO_EUR, 2);
  });

  it("USD asset → portfolio totals in EUR, FX vs price P&L decomposes", async () => {
    const usdStock = assetService.create({
      name: "US Stock",
      type: "investment",
      currency: "USD",
    });

    // Buy 10 units at $100 — cost basis = $1000 native, ≈ €920 base (rate 0.92)
    await lotService.buy(usdStock.id, {
      quantity: 10,
      pricePerUnit: 100,
      date: "2026-03-01",
    });

    // The lot creation only caches the FX rate for the lot date. The current-
    // value lookup needs *today's* rate; in production the 04:00 cron seeds
    // it. Mirror that here so the read path can convert without poking a
    // real provider.
    db.insert(marketPrices)
      .values({
        symbol: "USD",
        currency: "EUR",
        price: USD_TO_EUR,
        date: isoToday(),
        provider: "frankfurter",
      })
      .run();

    // The lot stores both prices, locked at creation.
    const lots = lotService.listLots(usdStock.id);
    expect(lots[0]!.pricePerUnit).toBe(100); // native
    expect(lots[0]!.pricePerUnitBase).toBeCloseTo(100 * USD_TO_EUR, 2); // ≈ 92

    // Asset metrics: native and base both populated. Lot price is the only
    // price source so currentValue == costBasis (no P&L yet).
    const asset = assetService.getById(usdStock.id);
    expect(asset?.currency).toBe("USD");
    expect(asset?.costBasis).toBe(1000);
    expect(asset?.costBasisBase).toBeCloseTo(920, 2);
    expect(asset?.currentValue).toBe(1000);
    expect(asset?.currentValueBase).toBeCloseTo(920, 2);
    expect(asset?.pnl).toBe(0);
    expect(asset?.pnlBase).toBeCloseTo(0, 2);

    // Portfolio sums asset values in EUR — buy is net-worth-neutral, so the
    // synthetic transfer's negative cash + positive asset value cancels out.
    const portfolio = portfolioService.getPortfolio();
    expect(portfolio.totalAssetValue).toBeCloseTo(920, 2);
    expect(portfolio.cashBalance).toBeCloseTo(-920, 2); // bought with €920 of cash
    expect(portfolio.netWorth).toBeCloseTo(0, 2);

    // Asset performance surfaces the FX/price split. With no price movement
    // and a constant FX rate, both components are zero.
    const performance = portfolioReports.getAssetPerformance();
    const stockPerf = performance.find((p) => p.assetId === usdStock.id);
    expect(stockPerf).toBeDefined();
    expect(stockPerf?.currency).toBe("USD");
    expect(stockPerf?.pricePnlBase).toBeCloseTo(0, 2);
    expect(stockPerf?.fxPnlBase).toBeCloseTo(0, 2);
    expect(stockPerf?.pnlBase).toBeCloseTo(0, 2);
  });

  // Regression: a foreign deposit tracked against an FX provider used to
  // resolve to its *rate* (0.92) instead of its price (1). Every consumer then
  // computed `holdings × price × rate`, converting to base twice: 800 USD came
  // out as "$736.00 ≈ €677.12" instead of "$800.00 ≈ €736.00". The rate belongs
  // to the conversion step alone, and this test pins each figure to the step it
  // comes from.
  it("USD deposit with exchange-rate tracking → converted to base exactly once", async () => {
    const travelFund = assetService.create({
      name: "USD Travel Fund",
      type: "deposit",
      currency: "USD",
      symbolMap: { frankfurter: "USD" },
    });

    await lotService.buy(travelFund.id, {
      quantity: 800,
      pricePerUnit: 1, // deposit invariant
      date: "2026-03-01",
    });

    // The rate the whole scenario turns on, cached the way the 04:00 cron
    // caches it: symbol=USD, currency=EUR — an exchange rate, not a price.
    db.insert(marketPrices)
      .values({
        symbol: "USD",
        currency: "EUR",
        price: USD_TO_EUR,
        date: isoToday(),
        provider: "frankfurter",
      })
      .run();

    const asset = assetService.getById(travelFund.id);
    // The balance is 800 USD whatever the euro does — a deposit's unit price is
    // its own currency, so the rate never touches the native figure.
    expect(asset?.latestPrice).toBe(1);
    expect(asset?.priceSource).toBe("deposit");
    expect(asset?.currentHoldings).toBe(800);
    expect(asset?.currentValue).toBe(800);
    // …and exactly one conversion reaches base. Under the old resolver this
    // was 800 × 0.92 × 0.92 = 677.12.
    expect(asset?.currentValueBase).toBeCloseTo(736, 2);

    // No native P&L: 800 USD cost 800 USD. The euro-side movement is nil here
    // because the lot booked at the same rate it is valued at.
    expect(asset?.pnl).toBe(0);
    expect(asset?.pnlBase).toBeCloseTo(0, 2);

    // Every cross-currency aggregate reads through the same resolver, so each
    // one carried the same doubled conversion.
    const portfolio = portfolioService.getPortfolio();
    expect(portfolio.totalAssetValue).toBeCloseTo(736, 2);

    const exposure = portfolioReports.getCurrencyExposure();
    expect(exposure.find((e) => e.currency === "USD")?.value).toBeCloseTo(736, 2);

    const allocation = portfolioReports.getAllocation();
    expect(allocation.byAsset.find((a) => a.assetId === travelFund.id)?.currentValue).toBeCloseTo(
      736,
      2
    );

    const netWorth = portfolioReports.getNetWorthTimeSeries("3m", "daily");
    expect(netWorth[netWorth.length - 1]?.assets).toBeCloseTo(736, 2);
  });

  // The history feed behind the asset detail charts. A deposit's price series
  // is a flat 1 by construction, so the series worth drawing is `rate` — which
  // is why the UI swaps the price card for an exchange-rate one.
  it("USD deposit history → flat unit price, exchange rate carried alongside", async () => {
    const travelFund = assetService.create({
      name: "USD Travel Fund",
      type: "deposit",
      currency: "USD",
    });
    await lotService.buy(travelFund.id, { quantity: 800, pricePerUnit: 1, date: "2026-03-01" });

    db.insert(marketPrices)
      .values({
        symbol: "USD",
        currency: "EUR",
        price: USD_TO_EUR,
        date: isoToday(),
        provider: "frankfurter",
      })
      .run();

    const history = portfolioReports.getAssetHistory(travelFund.id, "3m");
    const latest = history?.timeline[history.timeline.length - 1];
    expect(latest?.price).toBe(1);
    expect(latest?.value).toBe(800);
    expect(latest?.rate).toBeCloseTo(USD_TO_EUR, 4);
  });

  // The base-currency counterpart: rate is a constant 1, so the detail page
  // has nothing to plot but value.
  it("EUR deposit history → rate is 1, needing no cached FX row", async () => {
    const savings = assetService.create({ name: "Savings", type: "deposit", currency: "EUR" });
    await lotService.buy(savings.id, { quantity: 500, pricePerUnit: 1, date: "2026-03-01" });

    const history = portfolioReports.getAssetHistory(savings.id, "3m");
    const latest = history?.timeline[history.timeline.length - 1];
    expect(latest?.price).toBe(1);
    expect(latest?.rate).toBe(1);
  });
});
