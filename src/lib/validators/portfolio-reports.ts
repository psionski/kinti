import { z } from "zod";
import { IsoDateSchema } from "./common";

// ─── Shared Params ───────────────────────────────────────────────────────────

export const WindowSchema = z
  .enum(["3m", "6m", "12m", "ytd", "all"])
  .default("6m")
  .describe("Time window. Defaults to '6m'");
export type Window = z.infer<typeof WindowSchema>;

export const IntervalSchema = z
  .enum(["daily", "weekly", "monthly"])
  .default("monthly")
  .describe("Data point interval. Defaults to 'monthly'");
export type Interval = z.infer<typeof IntervalSchema>;

// ─── Net Worth Time Series ───────────────────────────────────────────────────

export const NetWorthQuerySchema = z.object({
  window: WindowSchema,
  interval: IntervalSchema,
});
export type NetWorthQuery = z.infer<typeof NetWorthQuerySchema>;

export const NetWorthPointSchema = z.object({
  date: z.string(),
  cash: z.number().describe("Cash balance in the configured base currency"),
  assets: z
    .number()
    .describe(
      "Sum of asset values converted to the configured base currency. " +
        "Assets without a cached FX rate for the date are silently skipped — " +
        "a partial total beats a wrong-unit total."
    ),
  total: z.number().describe("cash + assets in the configured base currency"),
});
export type NetWorthPoint = z.infer<typeof NetWorthPointSchema>;

// ─── Asset Performance ───────────────────────────────────────────────────────

export const AssetPerformanceQuerySchema = z.object({
  from: IsoDateSchema.optional().describe("Start of date range (YYYY-MM-DD)"),
  to: IsoDateSchema.optional().describe("End of date range (YYYY-MM-DD)"),
});
export type AssetPerformanceQuery = z.infer<typeof AssetPerformanceQuerySchema>;

export const AssetPerformanceItemSchema = z.object({
  assetId: z.number().int(),
  name: z.string(),
  type: z.string(),
  currency: z.string().describe("ISO 4217 of the asset itself (its native currency)"),
  costBasis: z.number().describe("FIFO cost basis in the asset's native currency"),
  costBasisBase: z.number().describe("FIFO cost basis converted to the configured base currency"),
  currentValue: z.number().describe("Holdings × latest price, in the asset's native currency"),
  currentValueBase: z
    .number()
    .nullable()
    .describe(
      "Holdings × latest price × current FX rate, in base currency. " +
        "Null when no current FX rate is cached for foreign-currency assets."
    ),
  pnl: z.number().describe("currentValue − costBasis in the asset's native currency"),
  pnlBase: z
    .number()
    .nullable()
    .describe("Total P&L in base currency. Null when currentValueBase is null."),
  pricePnlBase: z
    .number()
    .nullable()
    .describe(
      "Component of pnlBase attributable to the asset's price moving (in its native currency), " +
        "valued at the current FX rate. Equals pnlBase for base-currency assets."
    ),
  fxPnlBase: z
    .number()
    .nullable()
    .describe(
      "Component of pnlBase attributable to FX rate changes between cost and current dates. " +
        "Always 0 for base-currency assets. pricePnlBase + fxPnlBase = pnlBase."
    ),
  pnlPct: z.number().describe("pnl ÷ costBasis × 100, in native currency"),
  annualizedReturn: z.number().nullable(),
  daysHeld: z.number().int(),
});
export type AssetPerformanceItem = z.infer<typeof AssetPerformanceItemSchema>;

// ─── Allocation ──────────────────────────────────────────────────────────────

export const AllocationQuerySchema = z.object({
  historical: z.boolean().default(false),
  window: WindowSchema,
});
export type AllocationQuery = z.infer<typeof AllocationQuerySchema>;

export const AllocationItemSchema = z.object({
  assetId: z.number().int(),
  name: z.string(),
  type: z.string(),
  currentValue: z.number().describe("Current value in the configured base currency"),
  pct: z.number().describe("Share of total portfolio value, 0–100"),
});
export type AllocationItem = z.infer<typeof AllocationItemSchema>;

export const AllocationByTypeSchema = z.object({
  type: z.string(),
  currentValue: z.number().describe("Sum of asset values for this type, in the base currency"),
  pct: z.number(),
});
export type AllocationByType = z.infer<typeof AllocationByTypeSchema>;

export const AllocationResultSchema = z.object({
  byAsset: z.array(AllocationItemSchema),
  byType: z.array(AllocationByTypeSchema),
  currency: z
    .string()
    .describe("ISO 4217 base currency that all currentValue fields are denominated in"),
});
export type AllocationResult = z.infer<typeof AllocationResultSchema>;

// ─── Currency Exposure ───────────────────────────────────────────────────────

export const CurrencyExposureItemSchema = z.object({
  currency: z
    .string()
    .describe("Native ISO 4217 currency of the assets in this bucket (the bucket key)"),
  value: z
    .number()
    .describe(
      "Sum of asset values in this currency, converted to the configured base currency. " +
        "Buckets are comparable because every value is in the same base unit."
    ),
  pct: z.number().describe("Share of total portfolio value (in base), 0–100"),
});
export type CurrencyExposureItem = z.infer<typeof CurrencyExposureItemSchema>;

// ─── Realized P&L ────────────────────────────────────────────────────────────

export const RealizedPnlQuerySchema = z.object({
  from: IsoDateSchema.optional().describe("Filter sell dates from (YYYY-MM-DD)"),
  to: IsoDateSchema.optional().describe("Filter sell dates to (YYYY-MM-DD)"),
});
export type RealizedPnlQuery = z.infer<typeof RealizedPnlQuerySchema>;

export const RealizedPnlItemSchema = z.object({
  assetId: z.number().int(),
  name: z.string(),
  currency: z.string().describe("Asset's native currency"),
  totalSold: z.number(),
  proceeds: z.number().describe("Proceeds in the asset's native currency"),
  costBasis: z.number().describe("FIFO cost of consumed lots in the asset's native currency"),
  realizedPnl: z.number().describe("Realized P&L in the asset's native currency"),
  proceedsBase: z.number().describe("Proceeds converted to base currency at the sell-date FX rate"),
  costBasisBase: z
    .number()
    .describe(
      "FIFO cost of consumed lots, summed in base currency. Each lot's base cost was " +
        "snapshotted at its own buy-date FX rate, so historical cost is stable."
    ),
  realizedPnlBase: z
    .number()
    .describe("Realized P&L in base currency. Includes FX gain/loss between buy and sell dates."),
});
export type RealizedPnlItem = z.infer<typeof RealizedPnlItemSchema>;

export const RealizedPnlResultSchema = z.object({
  items: z.array(RealizedPnlItemSchema),
  totalProceeds: z
    .number()
    .describe("Total proceeds across all assets, summed in the base currency"),
  totalCostBasis: z
    .number()
    .describe("Total cost basis across all assets, summed in the base currency"),
  totalRealizedPnl: z
    .number()
    .describe("Total realized P&L across all assets, in the base currency"),
  currency: z
    .string()
    .describe("ISO 4217 base currency that all *Base fields and totals are denominated in"),
});
export type RealizedPnlResult = z.infer<typeof RealizedPnlResultSchema>;

// ─── Asset History ───────────────────────────────────────────────────────────

export const AssetHistoryQuerySchema = z.object({
  window: WindowSchema,
});
export type AssetHistoryQuery = z.infer<typeof AssetHistoryQuerySchema>;

export const AssetHistoryLotSchema = z.object({
  date: z.string(),
  quantity: z.number(),
  pricePerUnit: z.number(),
  type: z.enum(["buy", "sell"]),
  runningQuantity: z.number(),
});
export type AssetHistoryLot = z.infer<typeof AssetHistoryLotSchema>;

export const AssetHistoryPointSchema = z.object({
  date: z.string(),
  price: z.number().nullable(),
  quantity: z.number(),
  value: z.number().nullable(),
});
export type AssetHistoryPoint = z.infer<typeof AssetHistoryPointSchema>;

export const AssetHistoryResultSchema = z.object({
  lots: z.array(AssetHistoryLotSchema),
  timeline: z.array(AssetHistoryPointSchema),
});
export type AssetHistoryResult = z.infer<typeof AssetHistoryResultSchema>;

// ─── Transfer Summary ────────────────────────────────────────────────────────

export const TransferSummaryItemSchema = z.object({
  assetId: z.number().int(),
  assetName: z.string(),
  assetType: z.string(),
  purchases: z.number().describe("Cash spent on buys this month, in the configured base currency"),
  sales: z
    .number()
    .describe("Cash received from sells this month, in the configured base currency"),
  net: z.number().describe("purchases − sales, in the configured base currency"),
});
export type TransferSummaryItem = z.infer<typeof TransferSummaryItemSchema>;
