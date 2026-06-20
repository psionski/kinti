import { Temporal } from "@js-temporal/polyfill";
import {
  isoToday,
  offsetDate,
  daysBetween,
  windowToDateRange,
  generateDatePoints,
} from "@/lib/date-ranges";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { assets, assetLots, transactions } from "@/lib/db/schema";
import { resolvePrice } from "./price-resolver";
import { findCachedFxRate } from "./fx-cache";
import { getBaseCurrency, roundToCurrency } from "@/lib/format";
import {
  type Db,
  parseAssetRow,
  getHoldingsAtDate,
  getCostBasisAtDate,
  consumeFifo,
} from "./portfolio-helpers";

/**
 * Memoized FX-rate lookup keyed by `(currency, date)`. Net-worth time series
 * touches the same `(currency, date)` pair once per asset per date point, so
 * caching avoids hammering `findCachedPrice`'s 7-day-window query.
 *
 * Returns 1 for the base-currency case and `null` when no rate is cached
 * within the window — callers must skip the asset rather than mix units.
 */
function makeFxLookup(
  db: Db,
  baseCurrency: string
): (currency: string, date: string) => number | null {
  const cache = new Map<string, number | null>();
  return (currency: string, date: string): number | null => {
    if (currency === baseCurrency) return 1;
    const key = `${currency}|${date}`;
    if (cache.has(key)) return cache.get(key)!;
    const rate = findCachedFxRate(db, currency, baseCurrency, date);
    cache.set(key, rate);
    return rate;
  };
}
import type {
  Window,
  Interval,
  NetWorthPoint,
  AssetPerformanceItem,
  AllocationResult,
  AllocationItem,
  AllocationByType,
  CurrencyExposureItem,
  RealizedPnlResult,
  RealizedPnlItem,
  AssetHistoryResult,
  AssetHistoryLot,
  AssetHistoryPoint,
  TransferSummaryItem,
} from "@/lib/validators/portfolio-reports";

export class PortfolioReportService {
  constructor(private db: Db) {}

  // ─── Net Worth Time Series ────────────────────────────────────────────────

  getNetWorthTimeSeries(window: Window, interval: Interval): NetWorthPoint[] {
    const dateRange = windowToDateRange(window);

    // For "all", start from the earliest transaction or lot, not 2000-01-01
    if (window === "all") {
      const firstTx = this.db
        .select({ date: transactions.date })
        .from(transactions)
        .orderBy(asc(transactions.date))
        .limit(1)
        .get();
      const firstLot = this.db
        .select({ date: assetLots.date })
        .from(assetLots)
        .orderBy(asc(assetLots.date))
        .limit(1)
        .get();
      const earliest = [firstTx?.date, firstLot?.date].filter(Boolean).sort()[0];
      if (earliest) dateRange.from = earliest;
    }

    const datePoints = generateDatePoints(dateRange.from, dateRange.to, interval);
    if (datePoints.length === 0) return [];

    const baseCurrency = getBaseCurrency();
    const fx = makeFxLookup(this.db, baseCurrency);
    const allAssets = this.db.select().from(assets).all().map(parseAssetRow);

    // ── Batch cash: fetch all transactions once, compute running totals ──
    // Sum amount_base so cross-currency transactions roll up correctly. The
    // sign of `amount_base` mirrors `amount` (signed for transfers), so the
    // same accumulation logic works for income/expense/transfer.
    const txRows = this.db
      .select({
        date: transactions.date,
        type: transactions.type,
        amountBase: transactions.amountBase,
      })
      .from(transactions)
      .where(lte(transactions.date, datePoints[datePoints.length - 1]))
      .orderBy(asc(transactions.date))
      .all();

    // Build cumulative cash at each date point in a single pass
    const cashAtDate = new Map<string, number>();
    let txIdx = 0;
    let runningCash = 0;
    for (const dp of datePoints) {
      while (txIdx < txRows.length && txRows[txIdx].date <= dp) {
        const row = txRows[txIdx];
        if (row.type === "income") runningCash += row.amountBase;
        else if (row.type === "expense") runningCash -= row.amountBase;
        else if (row.type === "transfer") runningCash += row.amountBase;
        txIdx++;
      }
      cashAtDate.set(dp, roundToCurrency(runningCash, baseCurrency));
    }

    // ── Batch holdings: fetch all lots per asset once, compute running qty ──
    const holdingsPerAsset = new Map<number, Map<string, number>>();
    for (const asset of allAssets) {
      const lots = this.db
        .select({ date: assetLots.date, quantity: assetLots.quantity })
        .from(assetLots)
        .where(
          and(
            eq(assetLots.assetId, asset.id),
            lte(assetLots.date, datePoints[datePoints.length - 1])
          )
        )
        .orderBy(asc(assetLots.date), asc(assetLots.id))
        .all();

      const qtyAtDate = new Map<string, number>();
      let lotIdx = 0;
      let runningQty = 0;
      for (const dp of datePoints) {
        while (lotIdx < lots.length && lots[lotIdx].date <= dp) {
          runningQty += lots[lotIdx].quantity;
          lotIdx++;
        }
        qtyAtDate.set(dp, parseFloat(runningQty.toFixed(8)));
      }
      holdingsPerAsset.set(asset.id, qtyAtDate);
    }

    // ── Build result ────────────────────────────────────────────────────────
    // Asset values are converted to base via the per-(currency, date) FX
    // lookup. Foreign assets without a cached rate at the target date are
    // skipped — partial total beats wrong-unit total. The fxLookup memoizes
    // per (currency, date), so the cost is one query per distinct pair.
    return datePoints.map((date) => {
      const cash = cashAtDate.get(date) ?? 0;

      let assetTotal = 0;
      for (const asset of allAssets) {
        const holdings = holdingsPerAsset.get(asset.id)?.get(date) ?? 0;
        if (holdings <= 0) continue;

        const resolved = resolvePrice(this.db, asset, date);
        if (!resolved) continue;
        const rate = fx(asset.currency, date);
        if (rate === null) continue;
        assetTotal += holdings * resolved.price * rate;
      }
      const assetTotalRounded = roundToCurrency(assetTotal, baseCurrency);

      return {
        date,
        cash,
        assets: assetTotalRounded,
        total: roundToCurrency(cash + assetTotalRounded, baseCurrency),
      };
    });
  }

  // ─── Asset Performance ────────────────────────────────────────────────────

  getAssetPerformance(from?: string, to?: string): AssetPerformanceItem[] {
    const allAssets = this.db.select().from(assets).all().map(parseAssetRow);
    const today = isoToday();
    const evalDate = to ?? today;
    const baseCurrency = getBaseCurrency();

    return allAssets
      .map((asset) => {
        const holdings = getHoldingsAtDate(this.db, asset.id, evalDate);
        const { costBasis, costBasisBase, earliestDate } = getCostBasisAtDate(
          this.db,
          asset.id,
          evalDate,
          asset.currency
        );

        if (costBasis === 0 && holdings <= 0) return null;

        const resolved = resolvePrice(this.db, asset, evalDate);
        if (!resolved) return null;
        const currentValue = roundToCurrency(holdings * resolved.price, asset.currency);
        const pnl = roundToCurrency(currentValue - costBasis, asset.currency);
        const pnlPct = costBasis > 0 ? Math.round((pnl / costBasis) * 10000) / 100 : 0;

        // Convert current value to base currency. For base-currency assets the
        // FX rate is 1 and there's no decomposition to do. For foreign assets
        // we look up the most recent cached rate; if missing, base-side numbers
        // become null but the native-side numbers still render.
        let currentValueBase: number | null;
        let pnlBase: number | null;
        let pricePnlBase: number | null;
        let fxPnlBase: number | null;

        if (asset.currency === baseCurrency) {
          currentValueBase = currentValue;
          pnlBase = pnl;
          pricePnlBase = pnl;
          fxPnlBase = 0;
        } else {
          const currentRate = findCachedFxRate(this.db, asset.currency, baseCurrency, evalDate);
          if (currentRate === null) {
            currentValueBase = null;
            pnlBase = null;
            pricePnlBase = null;
            fxPnlBase = null;
          } else {
            currentValueBase = roundToCurrency(currentValue * currentRate, baseCurrency);
            pnlBase = roundToCurrency(currentValueBase - costBasisBase, baseCurrency);
            // Decompose total base P&L into "asset price moved" vs "FX moved":
            //   pricePnlBase = (currentNative − costNative) × currentRate
            //   fxPnlBase    = pnlBase − pricePnlBase
            //                = costNative × (currentRate − historicalAvgRate)
            // where historicalAvgRate is implicit in costBasisBase / costBasis.
            pricePnlBase = roundToCurrency((currentValue - costBasis) * currentRate, baseCurrency);
            fxPnlBase = roundToCurrency(pnlBase - pricePnlBase, baseCurrency);
          }
        }

        const daysHeld = earliestDate ? Math.max(1, daysBetween(earliestDate, evalDate)) : 0;

        let annualizedReturn: number | null = null;
        if (daysHeld > 30 && costBasis > 0) {
          annualizedReturn =
            Math.round((Math.pow(currentValue / costBasis, 365 / daysHeld) - 1) * 10000) / 100;
        }

        return {
          assetId: asset.id,
          name: asset.name,
          type: asset.type as string,
          currency: asset.currency,
          costBasis,
          costBasisBase,
          currentValue,
          currentValueBase,
          pnl,
          pnlBase,
          pricePnlBase,
          fxPnlBase,
          pnlPct,
          annualizedReturn,
          daysHeld,
        } satisfies AssetPerformanceItem;
      })
      .filter((item): item is AssetPerformanceItem => item !== null)
      .sort((a, b) => b.pnl - a.pnl);
  }

  // ─── Allocation ───────────────────────────────────────────────────────────

  getAllocation(): AllocationResult {
    const allAssets = this.db.select().from(assets).all().map(parseAssetRow);
    const today = isoToday();
    const baseCurrency = getBaseCurrency();
    const fx = makeFxLookup(this.db, baseCurrency);

    const items: AllocationItem[] = [];
    let totalValue = 0;

    // Allocation only makes sense in a single unit. Convert each asset's
    // current value to base via the cached FX rate; foreign assets without a
    // rate are silently dropped (consistent with attachMetrics) so the total
    // we ratio against is itself in base.
    for (const asset of allAssets) {
      const holdings = getHoldingsAtDate(this.db, asset.id, today);
      if (holdings <= 0) continue;

      const resolved = resolvePrice(this.db, asset, today);
      if (!resolved) continue;
      const rate = fx(asset.currency, today);
      if (rate === null) continue;

      const currentValueBase = roundToCurrency(holdings * resolved.price * rate, baseCurrency);
      if (currentValueBase <= 0) continue;

      totalValue += currentValueBase;
      items.push({
        assetId: asset.id,
        name: asset.name,
        type: asset.type,
        currentValue: currentValueBase,
        pct: 0,
      });
    }

    for (const item of items) {
      item.pct = totalValue > 0 ? Math.round((item.currentValue / totalValue) * 10000) / 100 : 0;
    }
    items.sort((a, b) => b.currentValue - a.currentValue);

    const typeMap = new Map<string, number>();
    for (const item of items) {
      typeMap.set(item.type, (typeMap.get(item.type) ?? 0) + item.currentValue);
    }
    const byType: AllocationByType[] = Array.from(typeMap.entries())
      .map(([type, currentValue]) => ({
        type,
        currentValue: roundToCurrency(currentValue, baseCurrency),
        pct: totalValue > 0 ? Math.round((currentValue / totalValue) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.currentValue - a.currentValue);

    return { byAsset: items, byType, currency: baseCurrency };
  }

  // ─── Currency Exposure ────────────────────────────────────────────────────

  getCurrencyExposure(): CurrencyExposureItem[] {
    const allAssets = this.db.select().from(assets).all().map(parseAssetRow);
    const today = isoToday();
    const baseCurrency = getBaseCurrency();
    const fx = makeFxLookup(this.db, baseCurrency);

    // Bucket key is the asset's *native* currency; bucket value is in base so
    // cross-bucket pcts compare apples-to-apples. Without the conversion, a
    // ¥100 000 yen asset (~€600) would dominate the chart over a $5 000 dollar
    // asset (~€4 600) just because the magnitude of the integer is larger.
    const currencyMap = new Map<string, number>();
    let totalValue = 0;

    for (const asset of allAssets) {
      const holdings = getHoldingsAtDate(this.db, asset.id, today);
      if (holdings <= 0) continue;

      const resolved = resolvePrice(this.db, asset, today);
      if (!resolved) continue;
      const rate = fx(asset.currency, today);
      if (rate === null) continue;

      const currentValueBase = holdings * resolved.price * rate;
      if (currentValueBase <= 0) continue;

      currencyMap.set(asset.currency, (currencyMap.get(asset.currency) ?? 0) + currentValueBase);
      totalValue += currentValueBase;
    }

    return Array.from(currencyMap.entries())
      .map(([currency, value]) => ({
        currency,
        value: roundToCurrency(value, baseCurrency),
        pct: totalValue > 0 ? Math.round((value / totalValue) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }

  // ─── Realized P&L ────────────────────────────────────────────────────────

  getRealizedPnL(from?: string, to?: string): RealizedPnlResult {
    const allAssets = this.db.select().from(assets).all().map(parseAssetRow);
    const baseCurrency = getBaseCurrency();
    const items: RealizedPnlItem[] = [];
    let totalProceedsBase = 0;
    let totalCostBasisBase = 0;

    for (const asset of allAssets) {
      const lots = this.db
        .select({
          quantity: assetLots.quantity,
          pricePerUnit: assetLots.pricePerUnit,
          pricePerUnitBase: assetLots.pricePerUnitBase,
          date: assetLots.date,
        })
        .from(assetLots)
        .where(eq(assetLots.assetId, asset.id))
        .orderBy(asc(assetLots.date), asc(assetLots.id))
        .all();

      const buyQueue: Array<{
        qty: number;
        price: number;
        priceBase: number;
        currency: string;
      }> = [];
      let totalSold = 0;
      let proceeds = 0;
      let proceedsBase = 0;
      let costOfSold = 0;
      let costOfSoldBase = 0;

      for (const lot of lots) {
        if (lot.quantity < 0) {
          if (from && lot.date < from) {
            // Sell before range — still consume from queue for FIFO accuracy
            consumeFifo(buyQueue, -lot.quantity);
            continue;
          }
          if (to && lot.date > to) continue;
        }

        if (lot.quantity > 0) {
          buyQueue.push({
            qty: lot.quantity,
            price: lot.pricePerUnit,
            priceBase: lot.pricePerUnitBase,
            currency: asset.currency,
          });
        } else {
          const toConsume = -lot.quantity;
          // The sell lot's pricePerUnitBase was snapshotted at sell time, so
          // proceedsBase reflects the FX rate at the moment of sale. Cost
          // basis comes from consumeFifo, which uses each buy lot's
          // historical FX rate.
          proceeds += toConsume * lot.pricePerUnit;
          proceedsBase += toConsume * lot.pricePerUnitBase;
          totalSold += toConsume;
          const consumed = consumeFifo(buyQueue, toConsume);
          costOfSold += consumed.cost;
          costOfSoldBase += consumed.costBase;
        }
      }

      if (totalSold > 0) {
        const proceedsRounded = roundToCurrency(proceeds, asset.currency);
        const costBasisRounded = roundToCurrency(costOfSold, asset.currency);
        const proceedsBaseRounded = roundToCurrency(proceedsBase, baseCurrency);
        const costBasisBaseRounded = roundToCurrency(costOfSoldBase, baseCurrency);
        items.push({
          assetId: asset.id,
          name: asset.name,
          currency: asset.currency,
          totalSold,
          proceeds: proceedsRounded,
          costBasis: costBasisRounded,
          realizedPnl: roundToCurrency(proceedsRounded - costBasisRounded, asset.currency),
          proceedsBase: proceedsBaseRounded,
          costBasisBase: costBasisBaseRounded,
          realizedPnlBase: roundToCurrency(
            proceedsBaseRounded - costBasisBaseRounded,
            baseCurrency
          ),
        });
        totalProceedsBase += proceedsBaseRounded;
        totalCostBasisBase += costBasisBaseRounded;
      }
    }

    items.sort((a, b) => b.realizedPnlBase - a.realizedPnlBase);

    return {
      items,
      totalProceeds: roundToCurrency(totalProceedsBase, baseCurrency),
      totalCostBasis: roundToCurrency(totalCostBasisBase, baseCurrency),
      totalRealizedPnl: roundToCurrency(totalProceedsBase - totalCostBasisBase, baseCurrency),
      currency: baseCurrency,
    };
  }

  // ─── Asset History ────────────────────────────────────────────────────────

  getAssetHistory(assetId: number, window: Window): AssetHistoryResult | null {
    const assetRow = this.db.select().from(assets).where(eq(assets.id, assetId)).get();
    if (!assetRow) return null;
    const asset = parseAssetRow(assetRow);

    const dateRange = windowToDateRange(window);

    // For "all", start from the earliest lot instead of the hardcoded 2000-01-01
    if (window === "all") {
      const firstLot = this.db
        .select({ date: assetLots.date })
        .from(assetLots)
        .where(eq(assetLots.assetId, assetId))
        .orderBy(asc(assetLots.date))
        .limit(1)
        .get();
      if (firstLot) dateRange.from = firstLot.date;
    }

    const lots = this.db
      .select({
        date: assetLots.date,
        quantity: assetLots.quantity,
        pricePerUnit: assetLots.pricePerUnit,
      })
      .from(assetLots)
      .where(
        and(
          eq(assetLots.assetId, assetId),
          gte(assetLots.date, dateRange.from),
          lte(assetLots.date, dateRange.to)
        )
      )
      .orderBy(asc(assetLots.date), asc(assetLots.id))
      .all();

    let runningQty = getHoldingsAtDate(this.db, assetId, offsetDate(dateRange.from, -1));
    const lotHistory: AssetHistoryLot[] = lots.map((lot) => {
      runningQty += lot.quantity;
      return {
        date: lot.date,
        quantity: Math.abs(lot.quantity),
        pricePerUnit: lot.pricePerUnit,
        type: lot.quantity > 0 ? "buy" : "sell",
        runningQuantity: runningQty,
      };
    });

    const datePoints = generateDatePoints(dateRange.from, dateRange.to, "weekly");

    // Batch holdings: fetch all lots up to last date point once,
    // then compute running quantity per date point in a single pass.
    const allLots = this.db
      .select({ date: assetLots.date, quantity: assetLots.quantity })
      .from(assetLots)
      .where(
        and(eq(assetLots.assetId, assetId), lte(assetLots.date, datePoints[datePoints.length - 1]))
      )
      .orderBy(asc(assetLots.date), asc(assetLots.id))
      .all();

    let lotIdx = 0;
    let cumulativeQty = 0;
    const timeline: AssetHistoryPoint[] = datePoints.map((date) => {
      while (lotIdx < allLots.length && allLots[lotIdx].date <= date) {
        cumulativeQty += allLots[lotIdx].quantity;
        lotIdx++;
      }
      const qty = parseFloat(cumulativeQty.toFixed(8));
      const resolved = resolvePrice(this.db, asset, date);
      const price = resolved?.price ?? null;
      // Single-asset history is always rendered in the asset's native currency,
      // so per-currency rounding is correct here even for non-base assets.
      const value = price !== null ? roundToCurrency(qty * price, asset.currency) : null;
      return { date, price, quantity: qty, value };
    });

    return { lots: lotHistory, timeline };
  }

  // ─── Transfer Summary ─────────────────────────────────────────────────────

  getTransferSummary(month: string): TransferSummaryItem[] {
    const dateFrom = `${month}-01`;
    const [y, m] = month.split("-").map(Number);
    const lastDay = Temporal.PlainYearMonth.from({ year: y, month: m }).daysInMonth;
    const dateTo = `${month}-${String(lastDay).padStart(2, "0")}`;
    const baseCurrency = getBaseCurrency();

    // Sum amount_base so cross-currency lots aggregate to a comparable total.
    // Each transfer transaction was denormalized to base at write time, so the
    // sum is unit-consistent across assets in different currencies.
    const rows = this.db
      .select({
        assetId: assets.id,
        assetName: assets.name,
        assetType: assets.type,
        quantity: assetLots.quantity,
        amountBase: transactions.amountBase,
      })
      .from(assetLots)
      .innerJoin(assets, eq(assetLots.assetId, assets.id))
      .innerJoin(transactions, eq(assetLots.transactionId, transactions.id))
      .where(and(gte(assetLots.date, dateFrom), lte(assetLots.date, dateTo)))
      .all();

    const assetMap = new Map<
      number,
      { name: string; type: string; purchases: number; sales: number }
    >();

    for (const row of rows) {
      const existing = assetMap.get(row.assetId) ?? {
        name: row.assetName,
        type: row.assetType,
        purchases: 0,
        sales: 0,
      };

      if (row.quantity > 0) {
        existing.purchases += Math.abs(row.amountBase);
      } else {
        existing.sales += Math.abs(row.amountBase);
      }

      assetMap.set(row.assetId, existing);
    }

    return Array.from(assetMap.entries()).map(([assetId, data]) => ({
      assetId,
      assetName: data.name,
      assetType: data.type,
      purchases: roundToCurrency(data.purchases, baseCurrency),
      sales: roundToCurrency(data.sales, baseCurrency),
      net: roundToCurrency(data.purchases - data.sales, baseCurrency),
    }));
  }
}
