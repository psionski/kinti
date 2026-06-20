import { z } from "zod";
import { AssetTypeSchema, SymbolMapSchema } from "./assets";
import { ProviderNameSchema } from "@/lib/providers/types";
import { PastOrTodayDateSchema } from "./common";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** SymbolMap that also accepts a JSON string (for GET query params). */
const QuerySymbolMapSchema = z.preprocess(
  (val) => (typeof val === "string" ? JSON.parse(val) : val),
  SymbolMapSchema
);

// ─── Common ───────────────────────────────────────────────────────────────────

const CurrencyCodeSchema = z
  .string()
  .min(2)
  .max(10)
  .toUpperCase()
  .describe("ISO 4217 currency code or crypto symbol (e.g. USD, EUR, BTC)");

const DateSchema = PastOrTodayDateSchema.optional();

// ─── Price (unified: exchange rates + market prices) ─────────────────────────

export const GetPriceSchema = z.object({
  symbolMap: QuerySymbolMapSchema.describe(
    "Provider→symbol mapping (JSON string in query params). Use search_symbol to discover symbols. " +
      "E.g. { coingecko: 'bitcoin' } or { frankfurter: 'USD' }"
  ),
  currency: CurrencyCodeSchema.optional().describe(
    "Target currency for the price. Defaults to the configured base currency when omitted."
  ),
  date: DateSchema.describe("Date in YYYY-MM-DD format. Defaults to today."),
});

export type GetPriceInput = z.infer<typeof GetPriceSchema>;

export const PriceResultSchema = z.object({
  symbol: z.string(),
  price: z.number(),
  currency: z.string(),
  date: z.string(),
  provider: ProviderNameSchema,
  stale: z.boolean(),
});

export type PriceResultResponse = z.infer<typeof PriceResultSchema>;

// ─── Convert Currency ─────────────────────────────────────────────────────────

export const ConvertCurrencySchema = z.object({
  amount: z.number().describe("Amount to convert (e.g. 15.99)"),
  from: CurrencyCodeSchema.describe("Source currency code (ISO 4217)"),
  to: CurrencyCodeSchema.describe("Target currency code (ISO 4217)"),
  date: DateSchema.describe("Date for the exchange rate. Defaults to today."),
});

export type ConvertCurrencyInput = z.infer<typeof ConvertCurrencySchema>;

export const ConvertResultSchema = z.object({
  converted: z.number().describe("Converted amount"),
  rate: z.number(),
  date: z.string(),
  provider: ProviderNameSchema,
  stale: z.boolean(),
});

export type ConvertResultResponse = z.infer<typeof ConvertResultSchema>;

// ─── Providers ────────────────────────────────────────────────────────────────

export const SetApiKeySchema = z.object({
  provider: ProviderNameSchema.describe("Provider name"),
  key: z.string().min(1).describe("API key for the provider"),
});

export type SetApiKeyInput = z.infer<typeof SetApiKeySchema>;

export const ProviderStatusSchema = z.object({
  name: ProviderNameSchema,
  assetTypes: z.array(AssetTypeSchema),
  apiKeyRequired: z.enum(["none", "optional", "required"]),
  apiKeySet: z.boolean(),
  healthy: z.boolean().nullable(),
});

export type ProviderStatusResponse = z.infer<typeof ProviderStatusSchema>;

// ─── API route param schemas ───────────────────────────────────────────────────

export const SetApiKeyBodySchema = z.object({
  key: z.string().min(1),
});

export const ProviderParamSchema = z.object({
  provider: ProviderNameSchema,
});

// ─── Symbol Search ───────────────────────────────────────────────────────────

export const SearchSymbolQuerySchema = z.object({
  query: z.string().min(1, "Search query is required"),
  assetType: AssetTypeSchema.optional().describe(
    "Filter providers by asset type. Omit to search all providers."
  ),
});

export type SearchSymbolQuery = z.infer<typeof SearchSymbolQuerySchema>;
