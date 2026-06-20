import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import { findCachedPrice } from "./financial-data";

type Db = BetterSQLite3Database<typeof schema>;

/**
 * Synchronous FX rate lookup from the local market_prices cache. Returns the
 * rate to convert one unit of `from` into `to` on or before `date` (within
 * the 7-day lookback used by `findCachedPrice`), or null when no rate is
 * cached.
 *
 * Used by read paths that must stay synchronous (asset metrics, dashboard
 * widgets, server components). Write paths use `FinancialDataService.convertToBase`
 * which is async and consults providers when the cache misses.
 *
 * The 04:00 cron's `backfillTransactionRates` populates rates for any
 * (date, currency) pair appearing on a transaction, so anything bought
 * through the normal lot/transfer flow has a rate available the day after.
 * Today's rate is populated by the same cron's market-price fetch.
 */
export function findCachedFxRate(db: Db, from: string, to: string, date: string): number | null {
  if (from === to) return 1;
  const cached = findCachedPrice(db, from, to, date);
  return cached?.price ?? null;
}
