import { and, eq, lt, lte, desc } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import { assetPrices, assetLots } from "@/lib/db/schema";
import type { AssetResponse } from "@/lib/validators/assets";
import { isoToday, offsetDate, localToUtc, utcToLocal } from "@/lib/date-ranges";
import { getBaseCurrency } from "@/lib/format";
import { findCachedPrice } from "./financial-data";

type Db = BetterSQLite3Database<typeof schema>;

export type PriceSource = "user" | "market" | "lot" | "deposit";

export interface ResolvedPrice {
  price: number;
  source: PriceSource;
  /**
   * The day this price is *for* — a trading day for market data, the local day
   * a user recorded a mark, the trade date for a lot. Not when it was fetched,
   * and not necessarily the date that was requested: a Monday lookup can
   * legitimately resolve to Friday's close.
   */
  asOf: string;
}

/** A price candidate paired with the day it applies to, before a source is assigned. */
interface Observation {
  price: number;
  asOf: string;
}

/**
 * Unified price resolver for both current valuation and historical reports.
 *
 * **The model:** a price is a dated observation, and the most recent observation
 * wins. Two kinds of observation are real valuations — a mark the user typed in
 * ("Set Price") and a quote from a provider — and they compete on date, with a
 * user mark winning a same-day tie because the user looked at the asset more
 * recently than the provider did.
 *
 * Lot cost basis is *not* a valuation. A fill price is what you paid, which is
 * a fact about a transaction, not a statement about what the asset is worth
 * today. It is therefore a last resort, used only when nothing has ever valued
 * the asset — never something that can outrank a mark or a quote by being newer.
 *
 * This ordering falls out of the model rather than being configured, which is
 * why it needs no staleness thresholds:
 *
 * - A fresh quote beats an old mark (that's what "the price updated" means).
 * - A mark entered today beats today's quote (the user is overriding on purpose).
 * - An unlinked asset — a car, a house — has no quotes, so its last mark carries
 *   forward for as long as the user leaves it alone.
 * - A weekend or holiday needs no special case: Friday's close is simply still
 *   the most recent observation on Sunday.
 *
 * Resolution:
 * 1. Deposit identity — base-currency deposits are always 1, no lookup needed
 * 2. The later of {user mark, market quote}; ties go to the user mark
 * 3. Lot cost basis, only when neither exists
 */
export function resolvePrice(db: Db, asset: AssetResponse, date?: string): ResolvedPrice | null {
  const effectiveDate = date ?? isoToday();
  const baseCurrency = getBaseCurrency();

  // Step 1: base-currency deposits are 1 unit/unit by definition — skip SQL
  if (asset.type === "deposit" && asset.currency === baseCurrency) {
    return { price: 1, source: "deposit", asOf: effectiveDate };
  }

  // Step 2: the most recent valuation, whoever made it
  const user = findUserPrice(db, asset.id, effectiveDate);
  const market = findMarketPrice(db, asset, effectiveDate, baseCurrency);

  if (user && market) {
    return user.asOf >= market.asOf ? { ...user, source: "user" } : { ...market, source: "market" };
  }
  if (user) return { ...user, source: "user" };
  if (market) return { ...market, source: "market" };

  // Step 3: nothing has ever valued this asset — fall back to what was paid
  const lot = findLotPrice(db, asset.id, effectiveDate);
  if (lot) return { ...lot, source: "lot" };

  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Most recent user-recorded mark on or before `date`.
 *
 * `recorded_at` is a UTC instant while `date` is a local calendar day, so the
 * cutoff is the local start of the following day converted to UTC — comparing
 * against a bare UTC midnight would admit marks belonging to the next local day
 * in eastern timezones. The `id` tiebreak keeps the result deterministic when
 * two marks share a timestamp.
 */
function findUserPrice(db: Db, assetId: number, date: string): Observation | null {
  const cutoff = localToUtc(offsetDate(date, 1) + "T00:00:00");

  const row = db
    .select({ pricePerUnit: assetPrices.pricePerUnit, recordedAt: assetPrices.recordedAt })
    .from(assetPrices)
    .where(and(eq(assetPrices.assetId, assetId), lt(assetPrices.recordedAt, cutoff)))
    .orderBy(desc(assetPrices.recordedAt), desc(assetPrices.id))
    .limit(1)
    .get();

  if (!row) return null;
  return { price: row.pricePerUnit, asOf: utcToLocal(row.recordedAt).slice(0, 10) };
}

/**
 * Most recent cached provider quote on or before `date`, across every
 * (provider, symbol) pair in the asset's symbolMap.
 *
 * Quotes denominated in the asset's own currency are preferred outright. A row
 * keyed by the *base* currency for the same symbol is an exchange rate, not a
 * price — that's how foreign-currency deposits are valued (symbol=EUR/USD/…,
 * currency=<base>) — so it only applies when the asset has no native quote.
 * Mixing the two tiers by date could hand back a rate as if it were a price.
 */
function findMarketPrice(
  db: Db,
  asset: AssetResponse,
  date: string,
  baseCurrency: string
): Observation | null {
  if (!asset.symbolMap) return null;

  // Partial records can hold explicit `undefined` values at runtime even though
  // `Object.entries` widens the value type to `string`, so keep the guard.
  const symbols = (Object.entries(asset.symbolMap) as Array<[string, string | undefined]>)
    .map(([, symbol]) => symbol)
    .filter((symbol): symbol is string => symbol !== undefined);

  const native = latestQuote(db, symbols, asset.currency, date);
  if (native) return native;

  if (asset.currency !== baseCurrency) {
    const rate = latestQuote(db, symbols, baseCurrency, date);
    if (rate) return rate;
  }

  return null;
}

/** Latest cached quote for any of `symbols` in `currency`, on or before `date`. */
function latestQuote(
  db: Db,
  symbols: string[],
  currency: string,
  date: string
): Observation | null {
  let best: schema.MarketPrice | null = null;
  for (const symbol of symbols) {
    const row = findCachedPrice(db, symbol, currency, date);
    if (row && (best === null || row.date > best.date)) best = row;
  }
  return best ? { price: best.price, asOf: best.date } : null;
}

/** Cost basis of the most recent lot at or before `date`. */
function findLotPrice(db: Db, assetId: number, date: string): Observation | null {
  const row = db
    .select({ pricePerUnit: assetLots.pricePerUnit, date: assetLots.date })
    .from(assetLots)
    .where(and(eq(assetLots.assetId, assetId), lte(assetLots.date, date)))
    .orderBy(desc(assetLots.date), desc(assetLots.id))
    .limit(1)
    .get();

  return row ? { price: row.pricePerUnit, asOf: row.date } : null;
}
