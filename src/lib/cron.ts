import cron from "node-cron";
import { getRecurringService, getFinancialDataService } from "@/lib/api/services";
import { runBackup } from "@/lib/services/backup";
import { getDb } from "@/lib/db";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import { findCachedPrice } from "@/lib/services/financial-data";
import { quoteCurrencyFor } from "@/lib/services/price-resolver";
import { assets } from "@/lib/db/schema";
import { isNotNull } from "drizzle-orm";
import { cronLogger } from "@/lib/logger";
import { isoToday } from "@/lib/date-ranges";
import { getBaseCurrency } from "@/lib/format";
import type { SymbolMap } from "@/lib/validators/assets";

type Db = BetterSQLite3Database<typeof schema>;

const DB_PATH = process.env.DATABASE_URL ?? "./data/kinti.db";

/**
 * Hours (local time) at which to re-attempt assets that still have no quote for
 * today. Deliberately few: retries share Alpha Vantage's 25 requests/day with
 * the user's own lookups, so this trades a bounded number of extra calls for
 * not leaving an asset mispriced for 24 hours.
 */
const MARKET_PRICE_RETRY_HOURS = [10, 16, 22];

/** Cron callback: generate pending recurring transactions up to today. */
export async function runRecurringJob(): Promise<void> {
  try {
    const service = getRecurringService();
    const created = await service.generatePending();
    if (created > 0) {
      cronLogger.info({ count: created }, "Generated recurring transactions");
    }
  } catch (err) {
    cronLogger.error({ err }, "Failed to generate recurring transactions");
  }
}

/** Cron callback: back up the SQLite database and rotate old backups. */
export async function runBackupJob(): Promise<void> {
  try {
    const result = await runBackup(DB_PATH);
    cronLogger.info({ path: result.path, rotated: result.rotatedCount }, "Backup saved");
  } catch (err) {
    cronLogger.error({ err }, "Backup failed");
  }
}

/**
 * Initialise all cron jobs. Guarded by a `globalThis` flag so that
 * Next.js dev-mode hot reloads don't spawn duplicate schedulers.
 */
export function initCronJobs(): void {
  const g = globalThis as unknown as { __kintiCronInit?: boolean };
  if (g.__kintiCronInit) return;
  g.__kintiCronInit = true;

  cron.schedule("0 2 * * *", () => void runRecurringJob());
  cron.schedule("0 3 * * *", () => void runBackupJob());
  cron.schedule("0 4 * * *", () => void runMarketPriceJob());

  // Retry passes for assets the 04:00 run could not price. A single daily
  // attempt means one bad response pins an asset to a stale quote — or, once
  // the quote ages out entirely, to its purchase price — until the next day.
  // Spread across the clock so a retry lands after Alpha Vantage's daily quota
  // resets and after every exchange we track has closed, without having to know
  // which of the two caused the miss.
  for (const hour of MARKET_PRICE_RETRY_HOURS) {
    cron.schedule(`0 ${hour} * * *`, () => void runMarketPriceRetry());
  }

  cronLogger.info(
    { retries: MARKET_PRICE_RETRY_HOURS },
    "Scheduled jobs: recurring (02:00), backup (03:00), market prices (04:00 + retries)"
  );

  // Startup warm: proactively cache common exchange rates for today
  void warmExchangeRates();
}

interface PriceSweepResult {
  warmed: number;
  skipped: number;
  failures: Array<{ assetId: number; symbols: string[]; reason: string }>;
  total: number;
}

/** True when some symbol in `map` already has a quote dated `today` cached. */
function hasQuoteForToday(db: Db, map: SymbolMap, currency: string, today: string): boolean {
  for (const symbol of symbolsOf(map)) {
    if (symbol === currency) continue;
    const cached = findCachedPrice(db, symbol, currency, today);
    if (cached?.date === today) return true;
  }
  return false;
}

/**
 * Symbols in a stored symbolMap. Parsed from JSON, so a partial record can hold
 * explicit `undefined` values even though the type widens them away.
 */
function symbolsOf(map: SymbolMap): string[] {
  return (Object.values(map) as Array<string | undefined>).filter(
    (symbol): symbol is string => symbol !== undefined
  );
}

/**
 * Fetch today's price for every asset with a symbolMap.
 *
 * With `onlyMissing`, assets that already have a quote dated today are skipped
 * without touching a provider — that is what makes the retry passes cheap
 * enough to run against a 25 requests/day budget, since on a normal day the
 * 04:00 run has already priced everything and the retries make no calls at all.
 */
async function sweepMarketPrices(onlyMissing: boolean): Promise<PriceSweepResult> {
  const db = getDb();
  const fds = getFinancialDataService();
  const today = isoToday();

  const baseCurrency = getBaseCurrency();

  const symbolAssets = db
    .select({
      id: assets.id,
      type: assets.type,
      symbolMap: assets.symbolMap,
      currency: assets.currency,
    })
    .from(assets)
    .where(isNotNull(assets.symbolMap))
    .all();

  // Individual assets are allowed to fail without aborting the run, but a
  // failure has to be *reported*: a provider that quietly returns no data
  // leaves the portfolio marked at whatever price it last had, which looks
  // identical to a price that simply hasn't moved.
  let warmed = 0;
  let skipped = 0;
  const failures: PriceSweepResult["failures"] = [];

  for (const asset of symbolAssets) {
    if (!asset.symbolMap) continue;

    // Parsing inside the per-asset try: one unreadable symbolMap should cost
    // that asset its price, not abort the sweep for every asset after it.
    let map: SymbolMap;
    let symbols: string[];
    try {
      map = JSON.parse(asset.symbolMap) as SymbolMap;
      symbols = symbolsOf(map);
    } catch (err) {
      failures.push({ assetId: asset.id, symbols: [], reason: `unreadable symbolMap: ${err}` });
      continue;
    }

    // A deposit's symbols are quoted against the base currency, not against
    // the deposit's own — see `quoteCurrencyFor`. A base-currency deposit has
    // nothing to fetch, and asking anyway would report it as a failure every
    // night for a rate that is 1 by definition.
    const quoteCurrency = quoteCurrencyFor(asset, baseCurrency);
    if (quoteCurrency === null) {
      skipped++;
      continue;
    }

    if (onlyMissing && hasQuoteForToday(db, map, quoteCurrency, today)) {
      skipped++;
      continue;
    }

    try {
      const result = await fds.getPrice(map, quoteCurrency, today);
      if (result && !result.stale) {
        warmed++;
      } else {
        failures.push({
          assetId: asset.id,
          symbols,
          reason: result ? "served stale cache — no provider returned fresh data" : "no data",
        });
      }
    } catch (err) {
      failures.push({ assetId: asset.id, symbols, reason: String(err) });
    }
  }

  return { warmed, skipped, failures, total: symbolAssets.length };
}

/**
 * Cron callback: for each asset with a symbol_map, fetch today's price
 * from providers to warm the market_prices cache. Also backfills FX rates
 * for any (date, currency) pair that appears in transactions but isn't
 * yet cached — keeps historical aggregations accurate as users add new
 * currencies.
 */
export async function runMarketPriceJob(): Promise<void> {
  try {
    const fds = getFinancialDataService();
    const { warmed, failures, total } = await sweepMarketPrices(false);

    cronLogger.info({ warmed, failed: failures.length, total }, "Market price refresh complete");
    if (failures.length > 0) {
      cronLogger.warn({ failures }, "Some assets could not be priced");
    }

    // Backfill any missing FX rates for foreign-currency transactions.
    try {
      const result = await fds.backfillTransactionRates();
      if (result.pairs > 0) {
        cronLogger.info(result, "Transaction FX rate backfill complete");
      }
    } catch (err) {
      cronLogger.warn({ err }, "Transaction FX backfill failed (non-fatal)");
    }

    // Refresh today's rate for every foreign-currency asset. Opening lots
    // (set during onboarding) don't create transactions, so the previous
    // backfill wouldn't see them — without this step, attachMetrics drops
    // them from cross-currency totals once their lot-date rate ages out of
    // the 7-day cache window.
    try {
      const result = await fds.backfillAssetCurrencyRates();
      if (result.currencies > 0) {
        cronLogger.info(result, "Asset FX rate backfill complete");
      }
    } catch (err) {
      cronLogger.warn({ err }, "Asset FX backfill failed (non-fatal)");
    }
  } catch (err) {
    cronLogger.error({ err }, "Market price job failed");
  }
}

/**
 * Cron callback: re-attempt only the assets still without a quote for today.
 *
 * Runs a few hours after the main sweep. Whether the morning miss was an
 * exhausted provider quota or an endpoint that returned nothing, the remedy is
 * the same — ask again later — so this deliberately does not try to tell the
 * two apart. Skips the FX backfills, which the 04:00 run already did.
 */
export async function runMarketPriceRetry(): Promise<void> {
  try {
    const { warmed, skipped, failures, total } = await sweepMarketPrices(true);
    if (warmed === 0 && failures.length === 0) return; // everything already priced

    cronLogger.info(
      { warmed, skipped, failed: failures.length, total },
      "Market price retry complete"
    );
    if (failures.length > 0) {
      cronLogger.warn({ failures }, "Assets still unpriced after retry");
    }
  } catch (err) {
    cronLogger.error({ err }, "Market price retry failed");
  }
}

async function warmExchangeRates(): Promise<void> {
  try {
    const svc = getFinancialDataService();
    const base = getBaseCurrency();
    // Warm common currencies against the configured base. Skip the base
    // itself — there is no rate to warm.
    const popular = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD"].filter((c) => c !== base);
    await Promise.all(popular.map((from) => svc.getPrice({ frankfurter: from }, base)));
    cronLogger.info({ base, warmed: popular.join(",") }, "Exchange rate cache warmed");
  } catch (err) {
    cronLogger.warn({ err }, "Exchange rate warm-up failed (non-fatal)");
  }
}
