// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb } from "../helpers";
import { AssetService } from "@/lib/services/assets";
import { AssetLotService } from "@/lib/services/asset-lots";
import { AssetPriceService } from "@/lib/services/asset-prices";
import { PortfolioService } from "@/lib/services/portfolio";
import { TransactionService } from "@/lib/services/transactions";
import { FinancialDataService } from "@/lib/services/financial-data";
import { SettingsService } from "@/lib/services/settings";
import { isoToday } from "@/lib/date-ranges";
import type { ProviderName, PriceResult } from "@/lib/providers/types";

let assetService: AssetService;
let lotService: AssetLotService;
let priceService: AssetPriceService;
let portfolioService: PortfolioService;
let txService: TransactionService;

/**
 * Build a FinancialDataService backed by mock providers that return a fixed
 * USD→EUR rate (1.10). Tests that exercise foreign-currency assets need this
 * because AssetLotService now consults FX at write time to compute amount_base.
 */
function makeFx(db: ReturnType<typeof makeTestDb>): FinancialDataService {
  return new FinancialDataService(db, new SettingsService(db), (name: ProviderName) => {
    return {
      name,
      getPrice: async (
        symbol: string,
        currency: string,
        date?: string
      ): Promise<PriceResult | null> => {
        // Trivially return 1.10 for any non-self conversion. Sufficient for tests
        // that just need amount_base to be deterministic.
        if (symbol === currency) return null;
        return {
          symbol,
          currency,
          price: 1.1,
          date: date ?? "2026-03-01",
          provider: name,
        };
      },
    };
  });
}

beforeEach(() => {
  const db = makeTestDb();
  const fx = makeFx(db);
  assetService = new AssetService(db);
  lotService = new AssetLotService(db, fx);
  priceService = new AssetPriceService(db);
  portfolioService = new PortfolioService(db);
  txService = new TransactionService(db, fx);
});

// ─── AssetService ─────────────────────────────────────────────────────────────

describe("AssetService", async () => {
  it("creates an asset and retrieves it", async () => {
    const asset = assetService.create({
      name: "Emergency Fund",
      type: "deposit",
      currency: "EUR",
    });
    expect(asset.id).toBeGreaterThan(0);
    expect(asset.name).toBe("Emergency Fund");
    expect(asset.type).toBe("deposit");
    expect(asset.currency).toBe("EUR");
  });

  it("list returns assets with zero metrics when no lots", async () => {
    // Investment with no price snapshot → currentValue/pnl are null
    assetService.create({ name: "My Stocks", type: "investment", currency: "EUR" });
    const list = assetService.list();
    expect(list).toHaveLength(1);
    expect(list[0].currentHoldings).toBe(0);
    expect(list[0].costBasis).toBe(0);
    expect(list[0].currentValue).toBeNull();
    expect(list[0].pnl).toBeNull();
  });

  it("getById returns null for missing asset", async () => {
    expect(assetService.getById(999)).toBeNull();
  });

  it("update changes asset metadata", async () => {
    const asset = assetService.create({ name: "BTC", type: "crypto", currency: "EUR" });
    const updated = assetService.update(asset.id, { name: "Bitcoin", icon: "₿" });
    expect(updated?.name).toBe("Bitcoin");
    expect(updated?.icon).toBe("₿");
  });

  it("delete removes asset and returns true", async () => {
    const asset = assetService.create({ name: "To Delete", type: "other", currency: "EUR" });
    expect(assetService.delete(asset.id)).toBe(true);
    expect(assetService.getById(asset.id)).toBeNull();
  });

  it("delete returns false for missing asset", async () => {
    expect(assetService.delete(999)).toBe(false);
  });

  it("EUR deposit with no price uses €1 fallback for currentValue", async () => {
    const asset = assetService.create({ name: "Savings", type: "deposit", currency: "EUR" });
    // Buy 1000 units (€1000)
    await lotService.buy(asset.id, { quantity: 1000, pricePerUnit: 1, date: "2026-01-01" });
    const retrieved = assetService.getById(asset.id);
    expect(retrieved?.currentHoldings).toBe(1000);
    expect(retrieved?.currentValue).toBe(1000); // 1000 * 1 = €1000
    expect(retrieved?.pnl).toBe(0); // cost = value for €1 deposits
  });

  it("buy auto-records price snapshot, so currentValue is available", async () => {
    const asset = assetService.create({ name: "USD Bond", type: "investment", currency: "USD" });
    await lotService.buy(asset.id, { quantity: 1000, pricePerUnit: 1.1, date: "2026-01-01" });
    const retrieved = assetService.getById(asset.id);
    expect(retrieved?.latestPrice).toBe(1.1);
    expect(retrieved?.currentValue).toBe(1100); // 1000 * 1.10
  });

  it("computes correct metrics with price snapshot", async () => {
    const today = isoToday();
    const asset = assetService.create({ name: "SPX", type: "investment", currency: "EUR" });
    await lotService.buy(asset.id, { quantity: 10, pricePerUnit: 345.63, date: "2026-01-01" });
    priceService.record(asset.id, { pricePerUnit: 360, recordedAt: `${today}T10:00:00Z` });

    const retrieved = assetService.getById(asset.id);
    expect(retrieved?.currentHoldings).toBe(10);
    expect(retrieved?.costBasis).toBe(3456.3); // 10 * 345.63
    expect(retrieved?.currentValue).toBe(3600); // 10 * 360
    expect(retrieved?.pnl).toBeCloseTo(143.7, 2); // 3600 - 3456.30
  });
});

// ─── AssetLotService ─────────────────────────────────────────────────────────

describe("AssetLotService", async () => {
  it("buy creates a transfer transaction and an asset lot atomically", async () => {
    const asset = assetService.create({ name: "BTC", type: "crypto", currency: "EUR" });
    const { lot, transaction } = await lotService.buy(asset.id, {
      quantity: 0.5,
      pricePerUnit: 80000,
      date: "2026-03-01",
    });

    expect(lot.assetId).toBe(asset.id);
    expect(lot.quantity).toBe(0.5);
    expect(lot.pricePerUnit).toBe(80000);
    expect(lot.transactionId).toBe(transaction.id);

    expect(transaction.type).toBe("transfer");
    expect(transaction.amount).toBe(-40000); // -(0.5 * 80000) — negative = cash out
    expect(transaction.date).toBe("2026-03-01");
  });

  it("buy uses custom description when provided", async () => {
    const asset = assetService.create({ name: "ETF", type: "investment", currency: "EUR" });
    const { transaction } = await lotService.buy(asset.id, {
      quantity: 5,
      pricePerUnit: 100,
      date: "2026-03-01",
      description: "Monthly ETF purchase",
    });
    expect(transaction.description).toBe("Monthly ETF purchase");
  });

  it("buy auto-generates description when none provided", async () => {
    const asset = assetService.create({ name: "SPX", type: "investment", currency: "EUR" });
    const { transaction } = await lotService.buy(asset.id, {
      quantity: 2,
      pricePerUnit: 345.63,
      date: "2026-03-01",
    });
    expect(transaction.description).toContain("SPX");
    expect(transaction.description).toContain("Buy");
  });

  it("buy auto-generates 'Deposit' description for deposit assets", async () => {
    const asset = assetService.create({ name: "Savings", type: "deposit", currency: "EUR" });
    const { transaction } = await lotService.buy(asset.id, {
      quantity: 5000,
      pricePerUnit: 1,
      date: "2026-03-01",
    });
    expect(transaction.description).toContain("Deposit");
    expect(transaction.description).not.toContain("Buy");
  });

  it("sell auto-generates 'Withdraw' description for deposit assets", async () => {
    const asset = assetService.create({ name: "Savings", type: "deposit", currency: "EUR" });
    await lotService.buy(asset.id, { quantity: 5000, pricePerUnit: 1, date: "2026-01-01" });
    const { transaction } = await lotService.sell(asset.id, {
      quantity: 1000,
      pricePerUnit: 1,
      date: "2026-03-01",
    });
    expect(transaction.description).toContain("Withdraw");
    expect(transaction.description).not.toContain("Sell");
  });

  it("sell creates a transfer transaction and negative lot", async () => {
    const asset = assetService.create({ name: "BTC", type: "crypto", currency: "EUR" });
    await lotService.buy(asset.id, { quantity: 1, pricePerUnit: 80000, date: "2026-01-01" });

    const { lot, transaction } = await lotService.sell(asset.id, {
      quantity: 0.3,
      pricePerUnit: 90000,
      date: "2026-03-01",
    });

    expect(lot.quantity).toBe(-0.3);
    expect(transaction.type).toBe("transfer");
    expect(transaction.amount).toBe(27000); // 0.3 * 90000
  });

  it("sell throws when quantity exceeds holdings", async () => {
    const asset = assetService.create({ name: "ETF", type: "investment", currency: "EUR" });
    await lotService.buy(asset.id, { quantity: 5, pricePerUnit: 100, date: "2026-01-01" });

    await expect(
      lotService.sell(asset.id, { quantity: 10, pricePerUnit: 100, date: "2026-03-01" })
    ).rejects.toThrow("Insufficient");
  });

  it("sell throws for unknown asset", async () => {
    await expect(
      lotService.sell(999, { quantity: 1, pricePerUnit: 1, date: "2026-03-01" })
    ).rejects.toThrow("not found");
  });

  // ── Regression: deposit pricePerUnit guard ──────────────────────────────────
  // Deposits are 1-unit-per-currency-unit by definition (the quantity carries
  // the amount). Anything else corrupts cost basis. The guard fires for ALL
  // deposits regardless of currency, on every lot-creation path.

  it("buy throws for base-currency deposit with pricePerUnit !== 1", async () => {
    const asset = assetService.create({ name: "Savings", type: "deposit", currency: "EUR" });
    await expect(
      lotService.buy(asset.id, { quantity: 1, pricePerUnit: 5000, date: "2026-01-01" })
    ).rejects.toThrow("pricePerUnit must be 1");
  });

  it("buy accepts base-currency deposit with pricePerUnit === 1", async () => {
    const asset = assetService.create({ name: "Savings", type: "deposit", currency: "EUR" });
    const { lot } = await lotService.buy(asset.id, {
      quantity: 5000,
      pricePerUnit: 1,
      date: "2026-01-01",
    });
    expect(lot.quantity).toBe(5000);
    expect(lot.pricePerUnit).toBe(1);
  });

  it("buy throws for foreign-currency deposit with pricePerUnit !== 1", async () => {
    const asset = assetService.create({ name: "USD Account", type: "deposit", currency: "USD" });
    await expect(
      lotService.buy(asset.id, { quantity: 1000, pricePerUnit: 1.1, date: "2026-01-01" })
    ).rejects.toThrow("pricePerUnit must be 1");
  });

  it("sell throws for foreign-currency deposit with pricePerUnit !== 1", async () => {
    const asset = assetService.create({ name: "USD Account", type: "deposit", currency: "USD" });
    await lotService.buy(asset.id, { quantity: 1000, pricePerUnit: 1, date: "2026-01-01" });
    await expect(
      lotService.sell(asset.id, { quantity: 100, pricePerUnit: 1.1, date: "2026-02-01" })
    ).rejects.toThrow("pricePerUnit must be 1");
  });

  it("createOpeningLot throws for foreign-currency deposit with pricePerUnit !== 1", async () => {
    const asset = assetService.create({ name: "USD Account", type: "deposit", currency: "USD" });
    await expect(
      lotService.createOpeningLot(asset.id, {
        quantity: 1000,
        pricePerUnit: 1.1,
        date: "2026-01-01",
      })
    ).rejects.toThrow("pricePerUnit must be 1");
  });

  // ── Regression: every code path that creates a lot must populate the base
  //               column. The sample-data seed used to db.insert() lots without
  //               pricePerUnitBase, letting the NOT NULL DEFAULT 0 take over —
  //               which made costBasisBase render as 0 and turned pnlBase into
  //               the entire current value. attachMetrics reads the column
  //               directly, so a missing write silently corrupts every reader.
  // ────────────────────────────────────────────────────────────────────────────

  it("regression: buy populates pricePerUnitBase so costBasisBase is non-zero", async () => {
    const asset = assetService.create({ name: "VWCE", type: "investment", currency: "EUR" });
    await lotService.buy(asset.id, { quantity: 5, pricePerUnit: 100, date: "2026-01-01" });

    const lots = lotService.listLots(asset.id);
    expect(lots[0].pricePerUnitBase).toBe(100); // EUR base, EUR asset → 1:1

    const metrics = assetService.getById(asset.id);
    expect(metrics?.costBasis).toBe(500);
    expect(metrics?.costBasisBase).toBe(500); // would be 0 if base column unset
    expect(metrics?.pnlBase).toBe(0); // would equal currentValueBase if base unset
  });

  it("regression: sell populates pricePerUnitBase on the negative lot", async () => {
    const asset = assetService.create({ name: "VWCE", type: "investment", currency: "EUR" });
    await lotService.buy(asset.id, { quantity: 5, pricePerUnit: 100, date: "2026-01-01" });
    await lotService.sell(asset.id, { quantity: 2, pricePerUnit: 110, date: "2026-02-01" });

    const lots = lotService.listLots(asset.id);
    const sellLot = lots.find((l) => l.quantity < 0);
    expect(sellLot?.pricePerUnitBase).toBe(110);
  });

  it("regression: createOpeningLot populates pricePerUnitBase", async () => {
    const asset = assetService.create({ name: "Savings", type: "deposit", currency: "EUR" });
    const lot = await lotService.createOpeningLot(asset.id, {
      quantity: 5000,
      pricePerUnit: 1,
      date: "2026-01-01",
    });
    expect(lot.pricePerUnitBase).toBe(1);
  });

  // ── Regression: per-currency rounding for non-2-decimal base currencies. ──
  //               attachMetrics used to call Math.round(x * 100) / 100 directly,
  //               which is wrong for JPY (0 decimals) — sub-yen noise survived.
  // ──────────────────────────────────────────────────────────────────────────

  it("regression: costBasisBase respects per-currency precision (JPY base, 0 decimals)", async () => {
    const { setBaseCurrencyCache } = await import("@/lib/format");
    setBaseCurrencyCache("JPY");
    try {
      // Need a fresh DB seeded with JPY base so the integer-only currency
      // flows through every helper consistently.
      const jpyDb = makeTestDb({ baseCurrency: "JPY" });
      const fx = makeFx(jpyDb);
      const jpyAssetService = new AssetService(jpyDb);
      const jpyLotService = new AssetLotService(jpyDb, fx);

      const asset = jpyAssetService.create({
        name: "Tokyo Stock",
        type: "investment",
        currency: "JPY",
      });
      // 7 units at ¥1234.56 each — naive 2-decimal rounding would leave noise.
      await jpyLotService.buy(asset.id, {
        quantity: 7,
        pricePerUnit: 1234.56,
        date: "2026-01-01",
      });

      const metrics = jpyAssetService.getById(asset.id);
      // 7 × 1234.56 = 8641.92 → JPY rounds to 8642 (no decimals).
      expect(metrics?.costBasis).toBe(8642);
      expect(metrics?.costBasisBase).toBe(8642);
      expect(Number.isInteger(metrics!.costBasisBase)).toBe(true);
    } finally {
      // Reset back to the default for the rest of the suite.
      setBaseCurrencyCache("EUR");
    }
  });

  // ── Regression: average-cost basis after partial sell ───────────────────────

  it("currentHoldings is free of IEEE 754 float noise", async () => {
    const asset = assetService.create({ name: "BTC", type: "crypto", currency: "EUR" });
    await lotService.buy(asset.id, { quantity: 0.003, pricePerUnit: 80000, date: "2026-01-01" });
    await lotService.buy(asset.id, { quantity: 0.003, pricePerUnit: 81000, date: "2026-02-01" });
    await lotService.buy(asset.id, { quantity: 0.003, pricePerUnit: 82000, date: "2026-03-01" });

    const retrieved = assetService.getById(asset.id);
    expect(retrieved?.currentHoldings).toBe(0.009);
  });

  it("costBasis (FIFO): partial sell consumes oldest lot first", async () => {
    const asset = assetService.create({ name: "VWCE", type: "investment", currency: "EUR" });
    // Buy 5 at €102.50
    await lotService.buy(asset.id, { quantity: 5, pricePerUnit: 102.5, date: "2026-03-01" });
    // Sell 2 — FIFO consumes 2 from the single lot, remaining 3 @ €102.50
    await lotService.sell(asset.id, { quantity: 2, pricePerUnit: 112, date: "2026-03-15" });

    const retrieved = assetService.getById(asset.id);
    expect(retrieved?.currentHoldings).toBe(3);
    expect(retrieved?.costBasis).toBe(307.5); // 3 * 102.50
  });

  it("costBasis (FIFO): sell consumes the first buy lot, leaving second", async () => {
    const asset = assetService.create({ name: "BTC", type: "crypto", currency: "EUR" });
    await lotService.buy(asset.id, { quantity: 1, pricePerUnit: 80000, date: "2026-01-01" });
    await lotService.buy(asset.id, { quantity: 1, pricePerUnit: 90000, date: "2026-02-01" });
    // Sell 1 — FIFO consumes the first lot (€80k), leaving 1 @ €90k
    await lotService.sell(asset.id, { quantity: 1, pricePerUnit: 95000, date: "2026-03-01" });

    const retrieved = assetService.getById(asset.id);
    expect(retrieved?.currentHoldings).toBe(1);
    expect(retrieved?.costBasis).toBe(90000); // second lot remains
  });

  it("costBasis (FIFO): fully closed position then re-buy resets cost basis", async () => {
    const asset = assetService.create({ name: "SPX", type: "investment", currency: "EUR" });
    // Buy 15, sell all 15, then buy 1 cheaply
    await lotService.buy(asset.id, { quantity: 15, pricePerUnit: 300, date: "2026-01-01" });
    await lotService.sell(asset.id, { quantity: 15, pricePerUnit: 320, date: "2026-01-15" });
    await lotService.buy(asset.id, { quantity: 1, pricePerUnit: 20, date: "2026-02-01" });

    const retrieved = assetService.getById(asset.id);
    expect(retrieved?.currentHoldings).toBe(1);
    expect(retrieved?.costBasis).toBe(20); // only the new €20 lot remains
  });

  it("listLots throws for non-existent asset", async () => {
    expect(() => lotService.listLots(999)).toThrow("not found");
  });

  it("listLots returns lots ordered by date descending", async () => {
    const asset = assetService.create({ name: "ETF", type: "investment", currency: "EUR" });
    await lotService.buy(asset.id, { quantity: 1, pricePerUnit: 100, date: "2026-01-01" });
    await lotService.buy(asset.id, { quantity: 2, pricePerUnit: 105, date: "2026-03-01" });

    const lots = lotService.listLots(asset.id);
    expect(lots).toHaveLength(2);
    expect(lots[0].date).toBe("2026-03-01");
    expect(lots[1].date).toBe("2026-01-01");
  });
});

// ─── AssetPriceService ────────────────────────────────────────────────────────

describe("AssetPriceService", async () => {
  it("record throws for non-existent asset", async () => {
    expect(() =>
      priceService.record(999, { pricePerUnit: 1, recordedAt: "2026-03-20T12:00:00Z" })
    ).toThrow("not found");
  });

  it("records a user price override", async () => {
    const asset = assetService.create({ name: "BTC", type: "crypto", currency: "EUR" });
    const price = priceService.record(asset.id, {
      pricePerUnit: 80000,
      recordedAt: "2026-03-20T12:00:00Z",
    });

    expect(price.pricePerUnit).toBe(80000);
    expect(price.assetId).toBe(asset.id);
    expect(price.recordedAt).toBe("2026-03-20T12:00:00");
  });
});

// ─── PortfolioService ─────────────────────────────────────────────────────────

describe("PortfolioService", async () => {
  it("returns zero net worth when no transactions or assets", async () => {
    const portfolio = portfolioService.getPortfolio();
    expect(portfolio.cashBalance).toBe(0);
    expect(portfolio.totalAssetValue).toBe(0);
    expect(portfolio.netWorth).toBe(0);
    expect(portfolio.assets).toHaveLength(0);
    expect(portfolio.pnl).toBeNull();
  });

  it("cash balance is income minus expenses plus signed transfers", async () => {
    await txService.create({
      amount: 1000,
      type: "income",
      description: "Salary",
      date: "2026-03-01",
    });
    await txService.create({
      amount: 300,
      type: "expense",
      description: "Rent",
      date: "2026-03-01",
    });
    // Negative transfer = asset purchase (cash out), should reduce cash balance
    await txService.create({
      amount: -500,
      type: "transfer",
      description: "Buy ETF",
      date: "2026-03-01",
    });

    const portfolio = portfolioService.getPortfolio();
    expect(portfolio.cashBalance).toBe(200); // 1000 - 300 - 500
  });

  it("net worth includes asset values and buying is net-worth-neutral", async () => {
    await txService.create({
      amount: 5000,
      type: "income",
      description: "Salary",
      date: "2026-03-01",
    });

    const asset = assetService.create({ name: "SPX", type: "investment", currency: "EUR" });
    // Buy 10 SPX @ €345.63 = €3,456.30 total
    await lotService.buy(asset.id, { quantity: 10, pricePerUnit: 345.63, date: "2026-03-01" });
    priceService.record(asset.id, { pricePerUnit: 360, recordedAt: `${isoToday()}T10:00:00Z` });

    const portfolio = portfolioService.getPortfolio();
    // cashBalance = income − purchases = 5000 − 3456.30 = 1543.70
    expect(portfolio.cashBalance).toBeCloseTo(1543.7, 2);
    expect(portfolio.totalAssetValue).toBe(3600); // 10 * 360
    // netWorth = cashBalance + assetValue = income + unrealised gain = 5000 + 143.70
    expect(portfolio.netWorth).toBeCloseTo(5143.7, 2);
    expect(portfolio.pnl).toBeCloseTo(143.7, 2); // 3600 − 3456.30
  });

  it("selling an asset is net-worth-neutral at the same price", async () => {
    await txService.create({
      amount: 5000,
      type: "income",
      description: "Salary",
      date: "2026-03-01",
    });

    const asset = assetService.create({ name: "SPX", type: "investment", currency: "EUR" });
    await lotService.buy(asset.id, { quantity: 10, pricePerUnit: 345.63, date: "2026-03-01" });
    priceService.record(asset.id, { pricePerUnit: 345.63, recordedAt: `${isoToday()}T10:00:00Z` });

    const before = portfolioService.getPortfolio();

    // Sell 4 at the same price — net worth must not change
    await lotService.sell(asset.id, { quantity: 4, pricePerUnit: 345.63, date: "2026-03-20" });

    const after = portfolioService.getPortfolio();
    expect(after.netWorth).toBe(before.netWorth);
    // Cash went up by the sale proceeds
    expect(after.cashBalance).toBe(before.cashBalance + 4 * 345.63);
    // Asset value went down by the same amount
    expect(after.totalAssetValue).toBe(before.totalAssetValue - 4 * 345.63);
  });

  it("allocation percentages sum to 100 for a single asset", async () => {
    const asset = assetService.create({ name: "BTC", type: "crypto", currency: "EUR" });
    await lotService.buy(asset.id, { quantity: 1, pricePerUnit: 80000, date: "2026-03-01" });
    priceService.record(asset.id, { pricePerUnit: 90000, recordedAt: `${isoToday()}T00:00:00Z` });

    const portfolio = portfolioService.getPortfolio();
    expect(portfolio.allocation).toHaveLength(1);
    expect(portfolio.allocation[0].pct).toBe(100);
  });
});

// ─── Opening Lots (onboarding) ──────────────────────────────────────────────

describe("AssetLotService.createOpeningLot", async () => {
  it("creates a lot with no linked transaction", async () => {
    const asset = assetService.create({ name: "Savings", type: "deposit", currency: "EUR" });
    const lot = await lotService.createOpeningLot(asset.id, {
      quantity: 5000,
      pricePerUnit: 1,
      date: "2026-03-20",
    });
    expect(lot.id).toBeGreaterThan(0);
    expect(lot.assetId).toBe(asset.id);
    expect(lot.quantity).toBe(5000);
    expect(lot.pricePerUnit).toBe(1);
    expect(lot.transactionId).toBeNull();
  });

  it("records a price snapshot when pricePerUnit > 0", async () => {
    const asset = assetService.create({ name: "BTC", type: "crypto", currency: "EUR" });
    await lotService.createOpeningLot(asset.id, {
      quantity: 0.5,
      pricePerUnit: 50000,
      date: "2026-03-20",
    });
    const updated = assetService.getById(asset.id);
    expect(updated!.latestPrice).toBe(50000);
  });

  it("skips price snapshot when pricePerUnit is 0 but lot still used for pricing", async () => {
    const asset = assetService.create({
      name: "Unknown Cost",
      type: "investment",
      currency: "EUR",
    });
    await lotService.createOpeningLot(asset.id, {
      quantity: 10,
      pricePerUnit: 0,
      date: "2026-03-20",
    });
    // No price snapshot recorded, but price resolver falls back to lot pricePerUnit (0)
    const updated = assetService.getById(asset.id);
    expect(updated!.latestPrice).toBe(0);
    expect(updated!.currentValue).toBe(0);
  });

  it("throws for non-existent asset", async () => {
    await expect(
      lotService.createOpeningLot(9999, { quantity: 1, pricePerUnit: 1, date: "2026-03-20" })
    ).rejects.toThrow("Asset 9999 not found");
  });

  it("opening lot contributes to holdings and cost basis", async () => {
    const asset = assetService.create({ name: "Savings", type: "deposit", currency: "EUR" });
    await lotService.createOpeningLot(asset.id, {
      quantity: 3000,
      pricePerUnit: 1,
      date: "2026-03-20",
    });
    const withMetrics = assetService.getById(asset.id);
    expect(withMetrics).not.toBeNull();
    expect(withMetrics!.currentHoldings).toBe(3000);
    expect(withMetrics!.costBasis).toBe(3000);
  });
});
