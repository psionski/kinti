import { and, eq, lte, sql, desc } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import { assetPrices, assetLots } from "@/lib/db/schema";
import type { AssetResponse } from "@/lib/validators/assets";
import { isoToday, offsetDate } from "@/lib/date-ranges";
import { getBaseCurrency } from "@/lib/format";
import { findCachedPrice } from "./financial-data";

type Db = BetterSQLite3Database<typeof schema>;

export type PriceSource = "user" | "market" | "lot" | "deposit";

export interface ResolvedPrice {
  price: number;
  source: PriceSource;
}

/**
 * Unified price resolver for both current valuation and historical reports.
 *
 * Lookups are always windowed around the target date (±1 day for user prices,
 * 7-day window for market prices, lots before date). When `date` is omitted
 * it defaults to today, so CRUD and reporting paths behave identically.
 *
 * Resolution order:
 * 1. Deposit identity — base-currency deposits: price is always 1, no DB needed
 * 2. User override — asset_prices entry
 * 3. Provider data — for each (provider, symbol) in symbolMap, look up market_prices.
 *    This covers crypto, stocks, AND exchange rates (all stored in one table).
 *    For exchange rates the lookup uses (symbol=currency_code, currency=<base>).
 * 4. Lot cost basis — most recent lot's price_per_unit
 */
export function resolvePrice(db: Db, asset: AssetResponse, date?: string): ResolvedPrice | null {
  const effectiveDate = date ?? isoToday();
  const baseCurrency = getBaseCurrency();

  // Step 1: Deposit identity — base-currency deposits are always 1 unit/unit, skip SQL
  if (asset.type === "deposit" && asset.currency === baseCurrency) {
    return { price: 1, source: "deposit" };
  }

  // Step 2: User override
  const userPrice = findUserPrice(db, asset.id, effectiveDate);
  if (userPrice !== null) return { price: userPrice, source: "user" };

  // Step 3: Provider data — iterate symbolMap (provider, symbol) pairs
  if (asset.symbolMap) {
    for (const [, symbol] of Object.entries(asset.symbolMap)) {
      if (symbol === undefined) continue;

      // Try with asset's own currency first (crypto/stocks priced in that currency)
      const mp = findCachedPrice(db, symbol, asset.currency, effectiveDate);
      if (mp) return { price: mp.price, source: "market" };

      // Try with base currency (exchange rates: symbol=<currency>, currency=<base>)
      if (asset.currency !== baseCurrency) {
        const xr = findCachedPrice(db, symbol, baseCurrency, effectiveDate);
        if (xr) return { price: xr.price, source: "market" };
      }
    }
  }

  // Step 4: Lot cost basis
  const lotPrice = findLotPrice(db, asset.id, effectiveDate);
  if (lotPrice !== null) return { price: lotPrice, source: "lot" };

  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Most recent user-recorded price on or before `date`. */
function findUserPrice(db: Db, assetId: number, date: string): number | null {
  const dayAfter = offsetDate(date, 1);

  const row = db
    .select({ pricePerUnit: assetPrices.pricePerUnit })
    .from(assetPrices)
    .where(
      and(eq(assetPrices.assetId, assetId), lte(assetPrices.recordedAt, dayAfter + "T00:00:00Z"))
    )
    .orderBy(sql`${assetPrices.recordedAt} desc`)
    .limit(1)
    .get();

  return row?.pricePerUnit ?? null;
}

/** Lot cost basis — most recent lot at or before `date`. */
function findLotPrice(db: Db, assetId: number, date: string): number | null {
  const row = db
    .select({ pricePerUnit: assetLots.pricePerUnit })
    .from(assetLots)
    .where(and(eq(assetLots.assetId, assetId), lte(assetLots.date, date)))
    .orderBy(desc(assetLots.date), desc(assetLots.id))
    .limit(1)
    .get();

  return row?.pricePerUnit ?? null;
}
