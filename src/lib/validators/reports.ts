import { z } from "zod";
import { IsoDateSchema, YearMonthSchema } from "./common";

// ─── Spending Summary ─────────────────────────────────────────────────────────

export const SpendingSummarySchema = z.object({
  dateFrom: IsoDateSchema.describe("Start of period (YYYY-MM-DD)"),
  dateTo: IsoDateSchema.describe("End of period (YYYY-MM-DD)"),
  groupBy: z
    .enum(["category", "month", "merchant"])
    .default("category")
    .describe("Group results by category, month, or merchant"),
  type: z.enum(["income", "expense", "all"]).default("expense"),
  compareDateFrom: IsoDateSchema.optional().describe("Start of comparison period (YYYY-MM-DD)"),
  compareDateTo: IsoDateSchema.optional().describe("End of comparison period (YYYY-MM-DD)"),
  includeTransfers: z.boolean().default(false).describe("Include asset transfers in the result"),
});

export type SpendingSummaryInput = z.infer<typeof SpendingSummarySchema>;

// ─── Category Stats ──────────────────────────────────────────────────────────

export const CategoryStatsSchema = z
  .object({
    dateFrom: IsoDateSchema.optional().describe("Start of date range (YYYY-MM-DD)"),
    dateTo: IsoDateSchema.optional().describe("End of date range (YYYY-MM-DD)"),
    month: YearMonthSchema.optional().describe("Month (YYYY-MM) — alternative to dateFrom/dateTo"),
    type: z.enum(["income", "expense", "all"]).default("expense"),
    includeZeroSpend: z.boolean().default(true).describe("Include categories with no transactions"),
    includeUncategorized: z.boolean().default(false).describe("Include uncategorized transactions"),
  })
  .refine((d) => d.month || (d.dateFrom && d.dateTo), {
    message: "Provide either 'month' or both 'dateFrom' and 'dateTo'",
  });

export type CategoryStatsInput = z.infer<typeof CategoryStatsSchema>;

// ─── Budget Stats ───────────────────────────────────────────────────────────

export const BudgetStatsSchema = z.object({
  month: YearMonthSchema,
  type: z.enum(["income", "expense", "all"]).default("expense"),
  includeZeroSpend: z.boolean().default(true),
  includeUncategorized: z.boolean().default(false),
});

export type BudgetStatsInput = z.infer<typeof BudgetStatsSchema>;

// ─── Trends ───────────────────────────────────────────────────────────────────

export const TrendsSchema = z.object({
  months: z
    .number()
    .int()
    .min(1)
    .max(24)
    .default(6)
    .describe("Number of months to look back (default 6, max 24)"),
  categoryId: z.number().int().positive().optional().describe("Filter to a single category"),
  type: z.enum(["income", "expense", "all"]).default("expense"),
});

export type TrendsInput = z.infer<typeof TrendsSchema>;

// ─── Daily Spend ──────────────────────────────────────────────────────────────

export const DailySpendSchema = z.object({
  days: z
    .number()
    .int()
    .min(1)
    .max(730)
    .default(365)
    .describe("Number of days to look back, ending today (default 365, max 730)"),
});

export type DailySpendInput = z.infer<typeof DailySpendSchema>;

// ─── Top Merchants ────────────────────────────────────────────────────────────

export const TopMerchantsSchema = z.object({
  dateFrom: IsoDateSchema.optional().describe("Start of date range (YYYY-MM-DD)"),
  dateTo: IsoDateSchema.optional().describe("End of date range (YYYY-MM-DD)"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(10)
    .describe("Max merchants to return (default 10)"),
  type: z.enum(["income", "expense", "all"]).default("expense"),
});

export type TopMerchantsInput = z.infer<typeof TopMerchantsSchema>;

// ─── Net Income ──────────────────────────────────────────────────────────

export const NetIncomeSchema = z.object({
  dateFrom: IsoDateSchema.optional(),
  dateTo: IsoDateSchema.optional(),
});

export type NetIncomeInput = z.infer<typeof NetIncomeSchema>;

export const NetIncomeResultSchema = z.object({
  totalIncome: z.number(),
  totalExpenses: z.number(),
  netIncome: z.number(),
  transactionCount: z.number().int(),
  currency: z.string().describe("ISO 4217 base currency that all amounts are denominated in"),
});

export type NetIncomeResult = z.infer<typeof NetIncomeResultSchema>;

// ─── Cash Balance ────────────────────────────────────────────────────────

export const CashBalanceResultSchema = z.object({
  cashBalance: z
    .number()
    .describe("Current checking account balance (income − expenses + asset transfers)"),
  totalIncome: z.number(),
  totalExpenses: z.number(),
  totalTransfers: z
    .number()
    .describe("Net cash effect of asset purchases/sales (negative = net outflow to assets)"),
  currency: z.string().describe("ISO 4217 base currency that all amounts are denominated in"),
});

export type CashBalanceResult = z.infer<typeof CashBalanceResultSchema>;

// ─── Return types ─────────────────────────────────────────────────────────────

export const SpendingGroupSchema = z.object({
  key: z.string(), // category name, YYYY-MM, or merchant name
  categoryId: z.number().int().nullable().optional(),
  total: z.number(),
  count: z.number().int(),
  compareTotal: z.number().optional(),
});

export type SpendingGroup = z.infer<typeof SpendingGroupSchema>;

export const CategorySpendingItemSchema = z.object({
  categoryId: z.number().int().nullable(),
  categoryName: z.string().nullable(),
  color: z.string().nullable(),
  icon: z.string().nullable(),
  parentId: z.number().int().nullable(),
  total: z.number(), // direct spend
  count: z.number().int(), // direct transaction count
  rollupTotal: z.number(), // this + descendants
  rollupCount: z.number().int(), // this + descendants
  percentage: z.number(), // 0–100, share of grand total
});

export type CategorySpendingItem = z.infer<typeof CategorySpendingItemSchema>;

export const BudgetStatsItemSchema = CategorySpendingItemSchema.extend({
  budgetAmount: z.number().nullable(),
});

export type BudgetStatsItem = z.infer<typeof BudgetStatsItemSchema>;

export const TrendPointSchema = z.object({
  month: z.string(), // YYYY-MM
  total: z.number(),
  count: z.number().int(),
});

export type TrendPoint = z.infer<typeof TrendPointSchema>;

export const DailySpendPointSchema = z.object({
  date: z.string().describe("Calendar date (YYYY-MM-DD)"),
  total: z.number().describe("Sum of expense amount_base for the day, in base currency"),
  count: z.number().int().describe("Number of expense transactions on the day"),
});

export type DailySpendPoint = z.infer<typeof DailySpendPointSchema>;

export const TopMerchantSchema = z.object({
  merchant: z.string(),
  total: z.number(),
  count: z.number().int(),
  avgAmount: z.number(),
});

export type TopMerchant = z.infer<typeof TopMerchantSchema>;

export const BudgetStatusItemSchema = z.object({
  categoryId: z.number().int(),
  categoryName: z.string(),
  budgetAmount: z.number(),
  spentAmount: z.number(),
  remainingAmount: z.number(), // can be negative
  percentUsed: z.number(), // 0+, can exceed 100
  isOver: z.boolean(),
});

export type BudgetStatusItem = z.infer<typeof BudgetStatusItemSchema>;

const PeriodSchema = z.object({
  dateFrom: z.string(),
  dateTo: z.string(),
  total: z.number(),
  count: z.number().int(),
});

export const TransferGroupSchema = z.object({
  assetId: z.number().int(),
  assetName: z.string(),
  assetType: z.string(),
  purchases: z.number(),
  sales: z.number(),
  net: z.number(),
});

export type TransferGroup = z.infer<typeof TransferGroupSchema>;

export const SpendingSummaryResultSchema = z.object({
  period: PeriodSchema,
  comparePeriod: PeriodSchema.optional(),
  groups: z.array(SpendingGroupSchema),
  transfers: z.array(TransferGroupSchema).optional(),
  currency: z.string().describe("ISO 4217 base currency that all totals are denominated in"),
});

export type SpendingSummaryResult = z.infer<typeof SpendingSummaryResultSchema>;

// ─── Wrapper schemas with currency labels ────────────────────────────────────

export const CategoryStatsResultSchema = z.object({
  items: z.array(CategorySpendingItemSchema),
  currency: z.string().describe("ISO 4217 base currency that all totals are denominated in"),
});
export type CategoryStatsResult = z.infer<typeof CategoryStatsResultSchema>;

export const TrendsResultSchema = z.object({
  points: z.array(TrendPointSchema),
  currency: z.string().describe("ISO 4217 base currency that all totals are denominated in"),
});
export type TrendsResult = z.infer<typeof TrendsResultSchema>;

export const DailySpendResultSchema = z.object({
  points: z.array(DailySpendPointSchema),
  currency: z.string().describe("ISO 4217 base currency that all totals are denominated in"),
});
export type DailySpendResult = z.infer<typeof DailySpendResultSchema>;

export const TopMerchantsResultSchema = z.object({
  merchants: z.array(TopMerchantSchema),
  currency: z.string().describe("ISO 4217 base currency that all totals are denominated in"),
});
export type TopMerchantsResult = z.infer<typeof TopMerchantsResultSchema>;

// ─── Month-only helper schemas ────────────────────────────────────────────────

export const MonthRangeSchema = z.object({
  month: YearMonthSchema,
});
export type MonthRangeInput = z.infer<typeof MonthRangeSchema>;
