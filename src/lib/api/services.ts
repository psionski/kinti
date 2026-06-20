import { getDb } from "@/lib/db";
import { TransactionService } from "@/lib/services/transactions";
import { CategoryService } from "@/lib/services/categories";
import { ReportService } from "@/lib/services/reports";
import { BudgetService } from "@/lib/services/budgets";
import { RecurringService } from "@/lib/services/recurring";
import { ReceiptService } from "@/lib/services/receipts";
import { SettingsService } from "@/lib/services/settings";
import { FinancialDataService } from "@/lib/services/financial-data";
import { AssetService } from "@/lib/services/assets";
import { AssetLotService } from "@/lib/services/asset-lots";
import { AssetPriceService } from "@/lib/services/asset-prices";
import { PortfolioService } from "@/lib/services/portfolio";
import { PortfolioReportService } from "@/lib/services/portfolio-reports";

export function getTransactionService(): TransactionService {
  const db = getDb();
  return new TransactionService(db, new FinancialDataService(db, new SettingsService(db)));
}

export function getCategoryService(): CategoryService {
  return new CategoryService(getDb());
}

export function getReportService(): ReportService {
  return new ReportService(getDb());
}

export function getBudgetService(): BudgetService {
  const db = getDb();
  return new BudgetService(db, new ReportService(db));
}

export function getRecurringService(): RecurringService {
  const db = getDb();
  return new RecurringService(db, new FinancialDataService(db, new SettingsService(db)));
}

export function getReceiptService(): ReceiptService {
  return new ReceiptService(getDb());
}

export function getSettingsService(): SettingsService {
  return new SettingsService(getDb());
}

export function getFinancialDataService(): FinancialDataService {
  const db = getDb();
  return new FinancialDataService(db, new SettingsService(db));
}

export function getAssetService(): AssetService {
  return new AssetService(getDb());
}

export function getAssetLotService(): AssetLotService {
  const db = getDb();
  return new AssetLotService(db, new FinancialDataService(db, new SettingsService(db)));
}

export function getAssetPriceService(): AssetPriceService {
  return new AssetPriceService(getDb());
}

export function getPortfolioService(): PortfolioService {
  return new PortfolioService(getDb());
}

export function getPortfolioReportService(): PortfolioReportService {
  return new PortfolioReportService(getDb());
}
