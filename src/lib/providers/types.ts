import { z } from "zod";

// ─── Provider Names ───────────────────────────────────────────────────────────

export const ProviderNameSchema = z.enum([
  "frankfurter",
  "fawazahmed",
  "ecb",
  "coingecko",
  "open-exchange-rates",
  "alpha-vantage",
  "exchangerate-api",
  "twelve-data",
  "finnhub",
  "coinmarketcap",
]);
export type ProviderName = z.infer<typeof ProviderNameSchema>;

// ─── Provider Result Types ─────────────────────────────────────────────────────

/**
 * Unified price result. Works for both market prices and exchange rates:
 * - Crypto/stocks: symbol="bitcoin", price=80000, currency="EUR"
 * - Exchange rates: symbol="USD", price=0.92, currency="EUR" (1 USD = 0.92 EUR)
 */
export interface PriceResult {
  symbol: string;
  price: number;
  currency: string;
  date: string; // YYYY-MM-DD
  provider: ProviderName;
}

// ─── Provider Interface ────────────────────────────────────────────────────────

export interface FinancialDataProvider {
  readonly name: ProviderName;

  /**
   * Fetch a price for a symbol in a given currency.
   * For exchange rate providers: symbol is the base currency (e.g. "USD"),
   * currency is the quote (e.g. "EUR"), and price is the rate.
   */
  getPrice?(symbol: string, currency: string, date?: string): Promise<PriceResult | null>;

  /** Fetch all available prices/rates for a symbol (e.g. all currency pairs for "USD"). */
  getPrices?(symbol: string, date?: string): Promise<PriceResult[]>;

  /** Fetch daily prices for a symbol over a date range. */
  getPriceRange?(
    symbol: string,
    currency: string,
    from: string,
    to: string
  ): Promise<PriceResult[]>;

  /** Search for a symbol by name/query. Returns matching symbols for auto-discovery. */
  searchSymbol?(query: string): Promise<SymbolSearchResult[]>;

  /** Verify API key is valid and service is reachable. */
  healthCheck?(): Promise<boolean>;
}

export interface SymbolSearchResult {
  provider: ProviderName;
  symbol: string;
  name: string;
  type?: string; // "crypto", "stock", "etf", etc.
  /**
   * ISO 4217 of the listing's denomination currency, when the provider knows
   * it. Helps users disambiguate cross-listed instruments (SHEL on LSE in GBP
   * vs SHEL on NYSE in USD) and lets the asset create form pre-fill the
   * currency field. Optional because not every provider exposes it.
   */
  currency?: string;
}
