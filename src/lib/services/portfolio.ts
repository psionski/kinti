import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import { AssetService } from "./assets";
import { ReportService } from "./reports";
import type { PortfolioResponse } from "@/lib/validators/assets";

type Db = BetterSQLite3Database<typeof schema>;

export class PortfolioService {
  private assetService: AssetService;
  private reportService: ReportService;

  constructor(db: Db) {
    this.assetService = new AssetService(db);
    this.reportService = new ReportService(db);
  }

  getPortfolio(): PortfolioResponse {
    const { cashBalance } = this.reportService.cashBalance();

    // Assets with metrics
    const allAssets = this.assetService.list();

    let totalAssetValue = 0;
    let pnlTotal = 0;
    let hasSomePnl = false;

    // Sum the base-currency equivalents — `cashBalance` is already in base, so
    // mixing native asset values into the total would corrupt the unit. Assets
    // whose currentValueBase is null (no FX rate cached) are silently skipped:
    // a partial total is more useful than a wrong one.
    for (const a of allAssets) {
      if (a.currentValueBase !== null) {
        totalAssetValue += a.currentValueBase;
      }
      if (a.pnlBase !== null) {
        pnlTotal += a.pnlBase;
        hasSomePnl = true;
      }
    }

    const netWorth = cashBalance + totalAssetValue;
    // Show partial P&L from assets that have a known price; null if none do (incl. no assets).
    const pnl = hasSomePnl ? pnlTotal : null;

    // Allocation percentages — also in base, so cross-currency assets compare apples-to-apples.
    const allocation = allAssets
      .filter((a) => a.currentValueBase !== null && a.currentValueBase > 0)
      .map((a) => ({
        assetId: a.id,
        name: a.name,
        currentValue: a.currentValueBase!,
        pct:
          totalAssetValue > 0
            ? Math.round((a.currentValueBase! / totalAssetValue) * 10000) / 100
            : 0,
      }));

    return {
      assets: allAssets,
      cashBalance,
      totalAssetValue,
      netWorth,
      pnl,
      allocation,
    };
  }
}
