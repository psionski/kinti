import cron from "node-cron";
import { getRecurringService, getFinancialDataService } from "@/lib/api/services";
import { runBackup } from "@/lib/services/backup";
import { getDb } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { isNotNull } from "drizzle-orm";
import { cronLogger } from "@/lib/logger";
import { isoToday } from "@/lib/date-ranges";
import { getBaseCurrency } from "@/lib/format";
import type { SymbolMap } from "@/lib/validators/assets";

const DB_PATH = process.env.DATABASE_URL ?? "./data/kinti.db";

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

  cronLogger.info("Scheduled jobs: recurring (02:00), backup (03:00), market prices (04:00)");

  // Startup warm: proactively cache common exchange rates for today
  void warmExchangeRates();
}

/**
 * Cron callback: for each asset with a symbol_map, fetch today's price
 * from providers to warm the market_prices cache. Also backfills FX rates
 * for any (date, currency) pair that appears in transactions but isn't
 * yet cached — keeps historical aggregations accurate as users add new
 * currencies.
 */
async function runMarketPriceJob(): Promise<void> {
  try {
    const db = getDb();
    const fds = getFinancialDataService();
    const today = isoToday();

    const symbolAssets = db
      .select({
        id: assets.id,
        symbolMap: assets.symbolMap,
        currency: assets.currency,
      })
      .from(assets)
      .where(isNotNull(assets.symbolMap))
      .all();

    let warmed = 0;
    for (const asset of symbolAssets) {
      if (!asset.symbolMap) continue;
      const map = JSON.parse(asset.symbolMap) as SymbolMap;

      try {
        const result = await fds.getPrice(map, asset.currency, today);
        if (result) warmed++;
      } catch {
        // Continue with next asset — individual failures are non-fatal
      }
    }

    if (warmed > 0) {
      cronLogger.info({ warmed, total: symbolAssets.length }, "Warmed market prices");
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
