import { eq, asc } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import { assetLots } from "@/lib/db/schema";
import type { FinancialDataService } from "./financial-data";
import type { AssetResponse } from "@/lib/validators/assets";
import { financialLogger } from "@/lib/logger";
import { isoToday } from "@/lib/date-ranges";
import { getBaseCurrency } from "@/lib/format";
import { quoteCurrencyFor } from "./price-resolver";

type Db = BetterSQLite3Database<typeof schema>;

/**
 * Trigger price history backfill for an asset with market symbols.
 * Call this fire-and-forget after creating/updating an asset with a symbolMap.
 * Populates market_prices from the asset's earliest lot date through today,
 * under the same key the read paths look the series up by — a native price for
 * stocks and crypto, a rate against the base currency for a foreign deposit.
 */
export function triggerSymbolBackfill(
  db: Db,
  financialDataService: FinancialDataService,
  asset: AssetResponse
): void {
  const symbolMap = asset.symbolMap;
  if (!symbolMap) return;

  const today = isoToday();
  const baseCurrency = getBaseCurrency();

  // Find earliest lot date for this asset
  const earliestLot = db
    .select({ date: assetLots.date })
    .from(assetLots)
    .where(eq(assetLots.assetId, asset.id))
    .orderBy(asc(assetLots.date))
    .limit(1)
    .get();

  const from = earliestLot?.date ?? today;

  // A base-currency deposit has no series to fetch — its price is 1 and it
  // needs no rate to itself.
  const quoteCurrency = quoteCurrencyFor(asset, baseCurrency);
  if (quoteCurrency === null) return;

  // Fire-and-forget: pass the full symbolMap so ensurePriceHistory
  // targets only the providers specified in the asset's configuration.
  void (async () => {
    try {
      await financialDataService.ensurePriceHistory(symbolMap, quoteCurrency, from, today);
    } catch (err) {
      financialLogger.warn({ assetId: asset.id, err }, "Symbol backfill failed");
    }
  })();
}
