import { eq, asc } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import { assetLots } from "@/lib/db/schema";
import type { FinancialDataService } from "./financial-data";
import type { AssetResponse } from "@/lib/validators/assets";
import { financialLogger } from "@/lib/logger";
import { isoToday } from "@/lib/date-ranges";
import { getBaseCurrency } from "@/lib/format";

type Db = BetterSQLite3Database<typeof schema>;

/**
 * Trigger price history backfill for an asset with market symbols.
 * Call this fire-and-forget after creating/updating an asset with a symbolMap.
 * Populates market_prices from the asset's earliest lot date through today,
 * plus exchange rates to the base currency for non-base-currency deposits.
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

  // Fire-and-forget: pass the full symbolMap so ensurePriceHistory
  // targets only the providers specified in the asset's configuration.
  void (async () => {
    try {
      // Backfill symbol priced in asset's own currency (stocks, crypto, base-currency deposits)
      await financialDataService.ensurePriceHistory(symbolMap, asset.currency, from, today);

      // Foreign-currency deposits need the exchange rate to the base currency
      if (asset.type === "deposit" && asset.currency !== baseCurrency) {
        await financialDataService.ensurePriceHistory(symbolMap, baseCurrency, from, today);
      }
    } catch (err) {
      financialLogger.warn({ assetId: asset.id, err }, "Symbol backfill failed");
    }
  })();
}
