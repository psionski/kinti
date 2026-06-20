import { Temporal } from "@js-temporal/polyfill";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import { assets, marketPrices, transactions } from "@/lib/db/schema";
import type {
  FinancialDataProvider,
  PriceResult,
  SymbolSearchResult,
  ProviderName,
} from "@/lib/providers/types";
import type { AssetType, SymbolMap } from "@/lib/validators/assets";
import type { SettingsService } from "./settings";
import { getProvider, getProvidersByAssetType } from "@/lib/providers/registry";
import { financialLogger } from "@/lib/logger";
import { isoToday, daysBetween, normalizeUtc, offsetDate } from "@/lib/date-ranges";
import { getBaseCurrency, roundToCurrency } from "@/lib/format";

type Db = BetterSQLite3Database<typeof schema>;

// ─── TTL Configuration ────────────────────────────────────────────────────────

/** Staleness window for current-day prices (milliseconds). */
const PRICE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/** Lookback window for cache queries (days). Covers weekends/holidays. */
const CACHE_LOOKBACK_DAYS = 7;

// ─── Result Types ─────────────────────────────────────────────────────────────

export interface ConvertResult {
  converted: number;
  rate: number;
  date: string;
  provider: ProviderName;
  stale: boolean;
}

/** Factory type for instantiating providers by name. Used for DI in tests. */
export type ProviderFactory = (name: ProviderName) => FinancialDataProvider | null;

/**
 * Default FX provider chain for generic currency lookups (no asset involved).
 * Frankfurter first (clean ECB data), fawazahmed0 as a free fallback covering
 * exotic currencies and pairs Frankfurter dropped (e.g. EUR/RUB post-2022).
 */
function defaultFxSymbolMap(symbol: string): SymbolMap {
  return {
    frankfurter: symbol,
    fawazahmed: symbol,
  };
}

// ─── Shared Cache Helpers ─────────────────────────────────────────────────────

type MarketPriceRow = typeof schema.marketPrices.$inferSelect;

/**
 * Find a cached price in market_prices with a 7-day lookback window.
 * No provider filter — cache key is (symbol, currency, date).
 */
export function findCachedPrice(
  db: Db,
  symbol: string,
  currency: string,
  date: string
): MarketPriceRow | null {
  const weekBefore = offsetDate(date, -CACHE_LOOKBACK_DAYS);

  return (
    db
      .select()
      .from(marketPrices)
      .where(
        and(
          eq(marketPrices.symbol, symbol),
          eq(marketPrices.currency, currency),
          gte(marketPrices.date, weekBefore),
          lte(marketPrices.date, date)
        )
      )
      .orderBy(desc(marketPrices.date))
      .limit(1)
      .get() ?? null
  );
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class FinancialDataService {
  private db: Db;
  private settings: SettingsService;
  private factory: ProviderFactory;

  constructor(db: Db, settings: SettingsService, factory?: ProviderFactory) {
    this.db = db;
    this.settings = settings;
    this.factory = factory ?? ((name) => getProvider(name, this.settings));
  }

  // ─── Unified Price Lookup ─────────────────────────────────────────────────

  /**
   * Get a price for a symbolMap in a given currency on a date.
   * Iterates symbolMap entries, checking cache then calling each provider.
   * Falls back to stale cache if all providers fail.
   */
  async getPrice(
    symbolMap: SymbolMap,
    currency: string,
    date?: string
  ): Promise<(PriceResult & { stale: boolean }) | null> {
    const priceDate = date ?? isoToday();
    const isHistorical = priceDate < isoToday();
    const entries = symbolMapEntries(symbolMap);

    // Phase 1: check cache for each symbol
    let staleEntry: MarketPriceRow | null = null;
    for (const [, symbol] of entries) {
      if (symbol === currency) continue;
      const cached = findCachedPrice(this.db, symbol, currency, priceDate);
      if (cached) {
        const age =
          Date.now() - Temporal.Instant.from(normalizeUtc(cached.fetchedAt)).epochMilliseconds;
        if (isHistorical || age < PRICE_TTL_MS) {
          financialLogger.debug({ symbol, currency, date: priceDate }, "Price served from cache");
          return { ...toPriceResult(cached), stale: false };
        }
        staleEntry ??= cached;
      }
    }

    // Phase 2: try each provider
    for (const [providerName, symbol] of entries) {
      if (symbol === currency) continue;
      const provider = this.factory(providerName);
      if (!provider) continue;

      try {
        const result = await provider.getPrice?.(symbol, currency, priceDate);
        if (result) {
          financialLogger.info(
            { provider: providerName, symbol, currency, date: priceDate },
            "External price fetched"
          );
          this.cachePrice({ ...result, date: priceDate });
          return { ...result, date: priceDate, stale: false };
        }
      } catch (err) {
        financialLogger.warn(
          { provider: providerName, symbol, currency, date: priceDate, err },
          "Provider price lookup failed"
        );
      }
    }

    // Phase 3: stale fallback
    if (staleEntry) {
      financialLogger.warn(
        { symbol: staleEntry.symbol, currency, date: priceDate },
        "All providers failed, returning stale cache"
      );
      return { ...toPriceResult(staleEntry), stale: true };
    }

    financialLogger.warn({ currency, date: priceDate }, "All providers failed, no cached data");
    return null;
  }

  /**
   * Get all available prices/rates for a symbolMap on a date.
   * Tries each provider's getPrices and returns the first success.
   */
  async getPrices(
    symbolMap: SymbolMap,
    date?: string
  ): Promise<(PriceResult & { stale: boolean })[]> {
    const priceDate = date ?? isoToday();
    const entries = symbolMapEntries(symbolMap);

    for (const [providerName, symbol] of entries) {
      const provider = this.factory(providerName);
      if (!provider?.getPrices) continue;

      try {
        const results = await provider.getPrices(symbol, priceDate);
        if (results.length > 0) {
          financialLogger.info(
            { provider: providerName, symbol, date: priceDate, count: results.length },
            "External prices fetched"
          );
          for (const r of results) this.cachePrice({ ...r, date: priceDate });
          return results.map((r) => ({ ...r, stale: false }));
        }
      } catch (err) {
        financialLogger.warn(
          { provider: providerName, symbol, date: priceDate, err },
          "Provider prices lookup failed"
        );
      }
    }

    return [];
  }

  /**
   * Convert an amount from one currency to another. The symbolMap is now
   * optional — when omitted, the default FX provider chain is used
   * (Frankfurter → fawazahmed0). Pass an explicit symbolMap only for asset-
   * coupled lookups (e.g. crypto/stocks).
   */
  async convert(
    amount: number,
    from: string,
    to: string,
    symbolMap?: SymbolMap,
    date?: string
  ): Promise<ConvertResult | null> {
    if (from === to) {
      return {
        converted: amount,
        rate: 1,
        date: date ?? isoToday(),
        provider: "frankfurter" as ProviderName,
        stale: false,
      };
    }

    const rateResult = await this.getPrice(symbolMap ?? defaultFxSymbolMap(from), to, date);
    if (!rateResult) return null;

    return {
      converted: roundToCurrency(amount * rateResult.price, to),
      rate: rateResult.price,
      date: rateResult.date,
      provider: rateResult.provider,
      stale: rateResult.stale,
    };
  }

  // ─── Base Currency Conversion ──────────────────────────────────────────────

  /**
   * Convert an amount in `from` currency to the base currency on `date` using
   * the default FX provider chain (Frankfurter → fawazahmed0). Returns the
   * converted amount or null if no provider can resolve the rate.
   *
   * Used by transaction-create paths to compute `amount_base` synchronously
   * at write time. The denormalized base amount means reports never need
   * FX joins, at the cost of failing the write when no rate is available
   * (which is the desired behaviour — never store an unconvertible amount).
   */
  async convertToBase(
    amount: number,
    from: string,
    date?: string
  ): Promise<{ amountBase: number; rate: number; date: string } | null> {
    const base = getBaseCurrency();
    const effectiveDate = date ?? isoToday();
    if (from === base) {
      return { amountBase: roundToCurrency(amount, base), rate: 1, date: effectiveDate };
    }
    const result = await this.getPrice(defaultFxSymbolMap(from), base, effectiveDate);
    if (!result) return null;
    return {
      amountBase: roundToCurrency(amount * result.price, base),
      rate: result.price,
      date: result.date,
    };
  }

  /**
   * Verify that a rate from `currency` to the base currency is resolvable
   * for the given date. Used at transaction-create time to fail fast with a
   * clear error when a user picks a currency no provider supports.
   *
   * Returns null on success or an error message on failure.
   */
  async assertCurrencySupported(currency: string, date?: string): Promise<string | null> {
    const base = getBaseCurrency();
    if (currency === base) return null;
    const result = await this.convertToBase(1, currency, date);
    if (result === null) {
      return `Currency ${currency} isn't supported by any configured FX provider — cannot convert to base ${base}.`;
    }
    return null;
  }

  /**
   * Backfill missing FX rates for all currencies that appear in transactions
   * over a date range. Bounded by the actual (date, currency) pairs in use,
   * so this is cheap even on large databases.
   *
   * Called nightly from the 04:00 cron to keep historical aggregations
   * accurate as new providers fill gaps over time. Also safe to call
   * on-demand from a UI button or MCP tool.
   */
  async backfillTransactionRates(): Promise<{ pairs: number; fetched: number }> {
    const base = getBaseCurrency();
    // Find every (date, currency) pair that has a transaction in a non-base
    // currency and no cached rate yet. The transactions table won't have a
    // currency column on day 1 of the migration — guard the schema check.
    const hasCurrencyCol = tableHasColumn(this.db, "transactions", "currency");
    if (!hasCurrencyCol) {
      return { pairs: 0, fetched: 0 };
    }

    const rows = this.db
      .all<{ date: string; currency: string }>(
        sql`SELECT DISTINCT t.date, t.currency
            FROM ${transactions} t
            LEFT JOIN ${marketPrices} mp
              ON mp.symbol = t.currency
             AND mp.currency = ${base}
             AND mp.date = t.date
            WHERE t.currency != ${base}
              AND mp.id IS NULL`
      )
      .filter((r) => r.date && r.currency);

    let fetched = 0;
    for (const { date, currency } of rows) {
      try {
        const result = await this.getPrice(defaultFxSymbolMap(currency), base, date);
        if (result) fetched++;
      } catch (err) {
        financialLogger.warn(
          { currency, date, err },
          "FX backfill: failed to fetch rate for transaction date"
        );
      }
    }

    if (rows.length > 0) {
      financialLogger.info(
        { base, pairs: rows.length, fetched },
        "Transaction FX rate backfill complete"
      );
    }

    return { pairs: rows.length, fetched };
  }

  /**
   * Ensure today's FX rate is cached for every foreign-currency asset in the
   * portfolio. This is the asset-side counterpart to `backfillTransactionRates`
   * — opening lots created via `createOpeningLot` don't generate a transaction,
   * so the transaction-table walk wouldn't pick them up. Without a fresh rate
   * the synchronous read paths (attachMetrics, allocation, currency exposure,
   * net worth) silently drop foreign assets from cross-currency totals.
   *
   * Called nightly from the 04:00 cron alongside `backfillTransactionRates`.
   * Also safe to call on-demand from a UI button or MCP tool.
   */
  async backfillAssetCurrencyRates(): Promise<{ currencies: number; fetched: number }> {
    const base = getBaseCurrency();
    const today = isoToday();

    // Distinct asset currencies that aren't the base. Cheap query — usually
    // a handful of rows.
    const rows = this.db
      .selectDistinct({ currency: assets.currency })
      .from(assets)
      .all()
      .filter((r) => r.currency && r.currency !== base);

    let fetched = 0;
    for (const { currency } of rows) {
      try {
        const result = await this.getPrice(defaultFxSymbolMap(currency), base, today);
        if (result) fetched++;
      } catch (err) {
        financialLogger.warn(
          { currency, date: today, err },
          "Asset FX backfill: failed to fetch today's rate"
        );
      }
    }

    if (rows.length > 0) {
      financialLogger.info(
        { base, currencies: rows.length, fetched },
        "Asset FX rate backfill complete"
      );
    }

    return { currencies: rows.length, fetched };
  }

  // ─── Range Backfill ────────────────────────────────────────────────────────

  /**
   * Ensure market_prices has data for symbolMap in a currency over [from, to].
   * For each (provider, symbol) entry, checks cached dates and fetches missing ones.
   */
  async ensurePriceHistory(
    symbolMap: SymbolMap,
    currency: string,
    from: string,
    to: string
  ): Promise<void> {
    const entries = symbolMapEntries(symbolMap);

    for (const [providerName, symbol] of entries) {
      if (symbol === currency) continue;

      const cached = this.db
        .select({ date: marketPrices.date })
        .from(marketPrices)
        .where(
          and(
            eq(marketPrices.symbol, symbol),
            eq(marketPrices.currency, currency),
            gte(marketPrices.date, from),
            lte(marketPrices.date, to)
          )
        )
        .all();

      const cachedDates = new Set(cached.map((r) => r.date));
      const expectedDays = daysBetween(from, to) + 1;
      if (expectedDays > 0 && cachedDates.size / expectedDays > 0.8) continue;

      const provider = this.factory(providerName);
      if (!provider?.getPriceRange) continue;

      financialLogger.debug(
        { provider: providerName, symbol, currency, from, to },
        "Backfilling price history"
      );

      try {
        const results = await provider.getPriceRange(symbol, currency, from, to);
        if (results.length > 0) {
          let inserted = 0;
          for (const r of results) {
            if (!cachedDates.has(r.date)) {
              this.cachePrice(r);
              inserted++;
            }
          }
          financialLogger.info(
            { provider: providerName, symbol, currency, from, to, inserted },
            "Price history backfilled"
          );
          return;
        }
      } catch (err) {
        financialLogger.warn(
          { provider: providerName, symbol, currency, from, to, err },
          "Provider price range lookup failed"
        );
      }
    }
  }

  // ─── Symbol Search ────────────────────────────────────────────────────────

  /**
   * Search for market symbols across providers, optionally filtered by asset type.
   */
  async searchSymbol(query: string, assetType?: AssetType): Promise<SymbolSearchResult[]> {
    const providers = getProvidersByAssetType(this.settings, assetType);
    const results: SymbolSearchResult[] = [];

    const searches = providers
      .filter((p) => p.searchSymbol)
      .map(async (p) => {
        try {
          const matches = await p.searchSymbol!(query);
          results.push(...matches);
        } catch (err) {
          financialLogger.warn({ provider: p.name, query, err }, "Symbol search provider failed");
        }
      });

    await Promise.allSettled(searches);
    financialLogger.info(
      { query, assetType, resultCount: results.length },
      "Symbol search completed"
    );
    return results;
  }

  /**
   * Stream symbol search results, yielding per-provider batches in completion order.
   */
  async *searchSymbolStream(
    query: string,
    assetType?: AssetType
  ): AsyncGenerator<{ provider: ProviderName; results: SymbolSearchResult[] }> {
    const providers = getProvidersByAssetType(this.settings, assetType).filter(
      (p) => p.searchSymbol
    );

    if (providers.length === 0) return;

    const indexed = providers.map((p, i) =>
      p.searchSymbol!(query)
        .then((results) => ({ index: i, provider: p.name, results }))
        .catch((err) => {
          financialLogger.warn({ provider: p.name, query, err }, "Symbol search provider failed");
          return { index: i, provider: p.name, results: [] as SymbolSearchResult[] };
        })
    );

    const remaining = new Set(indexed.map((_, i) => i));

    while (remaining.size > 0) {
      const winner = await Promise.race([...remaining].map((i) => indexed[i]));
      remaining.delete(winner.index);
      if (winner.results.length > 0) {
        yield { provider: winner.provider, results: winner.results };
      }
    }
  }

  // ─── Provider Management ───────────────────────────────────────────────────

  setApiKey(provider: string, key: string): void {
    this.settings.set(`provider.${provider}.key`, key);
  }

  getApiKey(provider: string): string | null {
    return this.settings.get(`provider.${provider}.key`);
  }

  // ─── Cache ──────────────────────────────────────────────────────────────────

  private cachePrice(result: PriceResult): void {
    this.db
      .insert(marketPrices)
      .values({
        symbol: result.symbol,
        price: result.price,
        currency: result.currency,
        date: result.date,
        provider: result.provider,
      })
      .onConflictDoUpdate({
        target: [marketPrices.symbol, marketPrices.currency, marketPrices.date],
        set: {
          price: result.price,
          provider: result.provider,
          fetchedAt: Temporal.Now.instant().toString(),
        },
      })
      .run();
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toPriceResult(row: MarketPriceRow): PriceResult {
  return {
    symbol: row.symbol,
    price: row.price,
    currency: row.currency,
    date: row.date,
    provider: row.provider as ProviderName,
  };
}

/** Extract defined entries from a SymbolMap (skips undefined values). */
function symbolMapEntries(symbolMap: SymbolMap): Array<[ProviderName, string]> {
  return Object.entries(symbolMap)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([name, symbol]) => [name as ProviderName, symbol]);
}

// Re-export for convenience
export type { PriceResult };

/**
 * Returns true if `table` has a column named `column`. Used to keep code
 * forward-compatible with migrations that haven't run yet (e.g. the cron
 * job runs before the user has migrated to schemas with the column).
 */
function tableHasColumn(db: Db, table: string, column: string): boolean {
  try {
    const rows = db.all<{ name: string }>(sql.raw(`PRAGMA table_info(${table})`));
    return rows.some((r) => r.name === column);
  } catch {
    return false;
  }
}
