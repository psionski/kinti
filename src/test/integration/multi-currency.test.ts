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
    expect(lots[0].pricePerUnit).toBe(100); // native
    expect(lots[0].pricePerUnitBase).toBeCloseTo(100 * USD_TO_EUR, 2); // ≈ 92

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
});
