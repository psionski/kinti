import { z } from "zod";
import { PastOrTodayDateSchema } from "./common";
import { ProviderNameSchema } from "@/lib/providers/types";

// ─── Asset Type ───────────────────────────────────────────────────────────────

export const AssetTypeSchema = z.enum(["deposit", "investment", "crypto", "other"]);
export type AssetType = z.infer<typeof AssetTypeSchema>;

// ─── Symbol Map ──────────────────────────────────────────────────────────────

/** Provider → symbol mapping, e.g. { coingecko: "bitcoin", "alpha-vantage": "BTC" } */
export const SymbolMapSchema = z.partialRecord(ProviderNameSchema, z.string());
export type SymbolMap = z.infer<typeof SymbolMapSchema>;

// ─── Asset CRUD ───────────────────────────────────────────────────────────────

export const CreateAssetSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  type: AssetTypeSchema.describe(
    "Asset type: 'deposit' (bank/savings/wallet), 'investment' (stocks/ETFs), 'crypto', 'other'"
  ),
  currency: z
    .string()
    .min(1)
    .max(10)
    .optional()
    .describe(
      "ISO 4217 fiat currency code (USD, EUR, GBP, JPY, …) the asset is denominated/priced in. " +
        "NEVER a crypto ticker (BTC, ETH) or stock symbol — those go in symbolMap. " +
        "For deposits: the account's currency. For investments: the listing currency (USD for NYSE, GBP for LSE, etc.). " +
        "For crypto: the fiat currency to track the holding in (ask the user; the base currency is usually right). " +
        "Defaults to the configured base currency when omitted — call get_base_currency to check."
    ),
  symbolMap: SymbolMapSchema.optional().describe(
    "Provider→symbol mapping for automatic price tracking (e.g. { coingecko: 'bitcoin' }, { 'alpha-vantage': 'AAPL' }). " +
      "This is where crypto tickers and stock symbols live, NOT in `currency`. Use search_symbol to discover the right mapping."
  ),
  icon: z.string().max(100).optional(),
  color: z.string().max(20).optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateAssetInput = z.infer<typeof CreateAssetSchema>;

export const UpdateAssetSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  type: AssetTypeSchema.optional(),
  currency: z.string().min(1).max(10).optional(),
  symbolMap: SymbolMapSchema.nullable()
    .optional()
    .describe(
      "Provider→symbol mapping for price tracking. Use search_symbol to discover symbols. Set to null to disable"
    ),
  icon: z.string().max(100).nullable().optional(),
  color: z.string().max(20).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type UpdateAssetInput = z.infer<typeof UpdateAssetSchema>;

export const AssetResponseSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  type: AssetTypeSchema,
  currency: z.string(),
  symbolMap: SymbolMapSchema.nullable(),
  icon: z.string().nullable(),
  color: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AssetResponse = z.infer<typeof AssetResponseSchema>;

export const AssetWithMetricsSchema = AssetResponseSchema.extend({
  currentHoldings: z.number(),
  costBasis: z.number().describe("FIFO cost basis in the asset's native currency"),
  costBasisBase: z
    .number()
    .describe(
      "FIFO cost basis converted to the configured base currency. " +
        "Each underlying lot was converted at its own creation-date FX rate, so this is " +
        "stable across rate drifts."
    ),
  currentValue: z
    .number()
    .nullable()
    .describe("Current value (currentHoldings × latestPrice) in the asset's native currency"),
  currentValueBase: z
    .number()
    .nullable()
    .describe(
      "Current value converted to the base currency using the most recent cached FX rate. " +
        "Null when no market FX rate is available within the 7-day lookback window."
    ),
  pnl: z.number().nullable().describe("currentValue − costBasis in the asset's native currency"),
  pnlBase: z
    .number()
    .nullable()
    .describe(
      "currentValueBase − costBasisBase. The total P&L in base currency, including FX effects. " +
        "Null when currentValueBase is null."
    ),
  latestPrice: z.number().nullable(),
});
export type AssetWithMetrics = z.infer<typeof AssetWithMetricsSchema>;

// ─── Lots ─────────────────────────────────────────────────────────────────────

export const BuyAssetSchema = z.object({
  quantity: z
    .number()
    .positive("Quantity must be positive")
    .describe(
      "Number of units to buy (can be fractional, e.g. 0.5). " +
        "For 'deposit' assets, this is the amount in the asset's currency (e.g. 500 for a 500 USD deposit)."
    ),
  pricePerUnit: z
    .number()
    .positive("Price must be positive")
    .describe(
      "Price per unit in the asset's native currency (e.g. 345.63). " +
        "For ANY 'deposit' asset, regardless of currency, this is always 1 — quantity carries the amount."
    ),
  date: PastOrTodayDateSchema.describe("Transaction date (YYYY-MM-DD). Cannot be in the future"),
  description: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
});
export type BuyAssetInput = z.infer<typeof BuyAssetSchema>;

export const SellAssetSchema = z.object({
  quantity: z
    .number()
    .positive("Quantity must be positive")
    .describe(
      "Number of units to sell. " +
        "For 'deposit' assets, this is the amount in the asset's currency (e.g. 500 for a 500 USD withdrawal)."
    ),
  pricePerUnit: z
    .number()
    .positive("Price must be positive")
    .describe(
      "Sale price per unit in the asset's native currency. " +
        "For ANY 'deposit' asset, regardless of currency, this is always 1 — quantity carries the amount."
    ),
  date: PastOrTodayDateSchema.describe("Transaction date (YYYY-MM-DD). Cannot be in the future"),
  description: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
});
export type SellAssetInput = z.infer<typeof SellAssetSchema>;

// ─── Opening Lots (onboarding) ───────────────────────────────────────────────

export const CreateOpeningLotSchema = z.object({
  quantity: z.number().positive("Quantity must be positive"),
  pricePerUnit: z.number().nonnegative("Price must be non-negative"),
  date: PastOrTodayDateSchema,
  notes: z.string().max(2000).optional(),
});
export type CreateOpeningLotInput = z.infer<typeof CreateOpeningLotSchema>;

export const SetOpeningCashBalanceSchema = z.object({
  amount: z
    .number()
    .positive("Amount must be positive")
    .describe(
      "Opening balance in the configured base currency (e.g. 5000). " +
        "Call get_base_currency to find out what that is."
    ),
  date: PastOrTodayDateSchema.optional().describe("Balance date (YYYY-MM-DD). Defaults to today"),
});
export type SetOpeningCashBalanceInput = z.infer<typeof SetOpeningCashBalanceSchema>;

export const AddOpeningAssetSchema = z.object({
  name: z.string().min(1).max(255),
  type: AssetTypeSchema.describe(
    "Asset type: 'deposit' (bank/savings/wallet), 'investment' (stocks/ETFs), 'crypto', 'other'"
  ),
  currency: z
    .string()
    .min(1)
    .max(10)
    .optional()
    .describe(
      "ISO 4217 fiat currency code (USD, EUR, GBP, …) the asset is denominated/priced in. " +
        "NEVER a crypto ticker or stock symbol — those go in symbolMap. " +
        "For deposits: the account's currency. For investments: the listing currency. " +
        "For crypto: the fiat to denominate the holding in (ask the user). " +
        "Defaults to the configured base currency when omitted."
    ),
  quantity: z
    .number()
    .positive("Quantity must be positive")
    .describe(
      "Number of units currently held. For 'deposit' assets, this is the amount in the asset's currency."
    ),
  costBasisTotal: z
    .number()
    .positive("Cost basis must be positive")
    .optional()
    .describe(
      "Total cost basis in the asset's native currency. " +
        "If omitted, calculated from pricePerUnit × quantity. Skip both for deposits."
    ),
  pricePerUnit: z
    .number()
    .positive("Price per unit must be positive")
    .optional()
    .describe(
      "Cost per unit in the asset's native currency. Used if costBasisTotal omitted. " +
        "For 'deposit' assets always pass 1 (or omit) — the quantity carries the amount. " +
        "If neither pricePerUnit nor costBasisTotal is provided, P&L starts from zero."
    ),
  symbolMap: SymbolMapSchema.optional().describe(
    "Provider→symbol mapping for price tracking (e.g. { coingecko: 'bitcoin' }). " +
      "Where crypto tickers and stock symbols live. Use search_symbol to discover the right mapping."
  ),
  date: PastOrTodayDateSchema.optional().describe("Lot date (YYYY-MM-DD). Defaults to today"),
  icon: z.string().max(100).optional(),
  color: z.string().max(20).optional(),
  notes: z.string().max(2000).optional(),
});
export type AddOpeningAssetInput = z.infer<typeof AddOpeningAssetSchema>;

export const AssetLotResponseSchema = z.object({
  id: z.number().int(),
  assetId: z.number().int(),
  quantity: z.number(),
  pricePerUnit: z
    .number()
    .describe("Price per unit in the asset's native currency, captured at lot creation"),
  pricePerUnitBase: z
    .number()
    .describe(
      "Price per unit converted to the configured base currency at the FX rate on the lot date. " +
        "Locked at lot creation so historical reports stay stable as provider rates drift."
    ),
  date: z.string(),
  transactionId: z.number().int().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});
export type AssetLotResponse = z.infer<typeof AssetLotResponseSchema>;

// ─── Prices ───────────────────────────────────────────────────────────────────

export const RecordPriceSchema = z.object({
  pricePerUnit: z
    .number()
    .positive("Price must be positive")
    .describe("Current price per unit in the asset's native currency"),
  recordedAt: z.string().optional().describe("ISO 8601 datetime. Defaults to now"),
});
export type RecordPriceInput = z.infer<typeof RecordPriceSchema>;

export const AssetPriceResponseSchema = z.object({
  id: z.number().int(),
  assetId: z.number().int(),
  pricePerUnit: z.number(),
  recordedAt: z.string(),
});
export type AssetPriceResponse = z.infer<typeof AssetPriceResponseSchema>;

// ─── Portfolio ────────────────────────────────────────────────────────────────

export const PortfolioAllocationSchema = z.object({
  assetId: z.number().int(),
  name: z.string(),
  currentValue: z.number(),
  pct: z.number(),
});

export const PortfolioResponseSchema = z.object({
  assets: z.array(AssetWithMetricsSchema),
  cashBalance: z.number(),
  totalAssetValue: z.number(),
  netWorth: z.number(),
  pnl: z.number().nullable(),
  allocation: z.array(PortfolioAllocationSchema),
});
export type PortfolioResponse = z.infer<typeof PortfolioResponseSchema>;
