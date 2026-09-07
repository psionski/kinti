import { and, eq, lt, lte, desc } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import { assetPrices, assetLots } from "@/lib/db/schema";
import type { AssetResponse, AssetType } from "@/lib/validators/assets";
import { isoToday, offsetDate, localToUtc, utcToLocal } from "@/lib/date-ranges";
import { findLatestQuote } from "./financial-data";

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
 * **Every observation is denominated in `asset.currency`**, and callers rely on
 * that: they multiply by holdings to get a native value and convert that once,
 * via `findCachedFxRate`, to reach base. A price in any other unit silently
 * corrupts every figure downstream of it, so no branch here may return one.
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
 * 1. Deposit identity — a deposit is always 1, in any currency, no lookup needed
 * 2. The later of {user mark, market quote}; ties go to the user mark
 * 3. Lot cost basis, only when neither exists
 */
export function resolvePrice(db: Db, asset: AssetResponse, date?: string): ResolvedPrice | null {
  const effectiveDate = date ?? isoToday();

  // Step 1: a deposit is worth exactly one unit of its own currency, on every
  // date, whatever the base currency happens to be — holding 800 USD is 800 USD
  // by definition. The base currency enters only when that native value is
  // converted for a cross-currency total, which is the caller's job and happens
  // exactly once. Resolving a foreign deposit through its FX rate instead would
  // return EUR-per-USD here and hand the caller a number it would convert a
  // second time.
  if (asset.type === "deposit") {
    return { price: 1, source: "deposit", asOf: effectiveDate };
  }

  // Step 2: the most recent valuation, whoever made it
  const user = findUserPrice(db, asset.id, effectiveDate);
  const market = findMarketPrice(db, asset, effectiveDate);

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
 * The currency an asset's symbols should be quoted in when refreshing
 * `market_prices` — the key `findMarketPrice` and `findCachedFxRate` read back.
 *
 * For anything but a deposit that's the asset's own currency: the resolver
 * hands back a native price, and one FX conversion turns it into base.
 *
 * A deposit's symbol *is* a currency code, so quoting it in its own currency
 * asks a provider for the rate from USD to USD — which every provider path
 * skips, leaving the nightly sweep to log the asset as unpriceable while the
 * rate that actually matters goes unrefreshed. What makes a foreign deposit
 * convertible is its rate against the base, so that is what gets fetched. A
 * base-currency deposit needs nothing at all: it has no rate to itself, hence
 * the null.
 */
export function quoteCurrencyFor(
  asset: { type: AssetType; currency: string },
  baseCurrency: string
): string | null {
  if (asset.type !== "deposit") return asset.currency;
  return asset.currency === baseCurrency ? null : baseCurrency;
}

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
 * Only quotes denominated in the asset's own currency count, because that is
 * the unit `resolvePrice` promises its callers. `market_prices` also holds rows
 * keyed by the *base* currency for the same symbol — `(USD, EUR, 0.86)` is an
 * exchange rate, not a price — and reading one here would return EUR-per-unit
 * from a function whose result is about to be multiplied by holdings and
 * converted to base again. Exchange rates have their own read path,
 * `findCachedFxRate`, and that is the only place they belong.
 *
 * `quoteCurrencyFor` keeps the write side consistent: the nightly sweep caches
 * a non-deposit asset's quotes under `asset.currency`, which is the key this
 * reads back.
 */
function findMarketPrice(db: Db, asset: AssetResponse, date: string): Observation | null {
  if (!asset.symbolMap) return null;

  // Partial records can hold explicit `undefined` values at runtime even though
  // `Object.entries` widens the value type to `string`, so keep the guard.
  const symbols = (Object.entries(asset.symbolMap) as Array<[string, string | undefined]>)
    .map(([, symbol]) => symbol)
    .filter((symbol): symbol is string => symbol !== undefined);

  return latestQuote(db, symbols, asset.currency, date);
}

/**
 * Latest cached quote for any of `symbols` in `currency`, on or before `date`.
 *
 * No staleness window: a quote is discarded by being *outranked*, never by
 * being old. `resolvePrice` compares what this returns against the other
 * observations by date, so a stale quote already loses to any newer mark — and
 * when it is the newest thing available, it is still a better answer than a
 * fill price from further back.
 */
function latestQuote(
  db: Db,
  symbols: string[],
  currency: string,
  date: string
): Observation | null {
  let best: schema.MarketPrice | null = null;
  for (const symbol of symbols) {
    const row = findLatestQuote(db, symbol, currency, date);
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
