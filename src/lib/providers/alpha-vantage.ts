import type { PriceResult, FinancialDataProvider, SymbolSearchResult } from "./types";
import { ProviderError, ProviderRateLimitError } from "./errors";
import { isoToday } from "@/lib/date-ranges";
import { providerFetch } from "./rate-limit";

const BASE_URL = "https://www.alphavantage.co/query";

/**
 * Alpha Vantage provider for stock and ETF prices.
 * Free tier: 25 req/day. Requires an API key (free to register).
 * Prices returned in USD; conversion needed for EUR display.
 */
export class AlphaVantageProvider implements FinancialDataProvider {
  readonly name = "alpha-vantage";

  constructor(private apiKey: string) {}

  /**
   * Alpha Vantage reports quota exhaustion and bad requests with HTTP 200 and
   * an envelope key instead of a status code:
   *   - "Information" — daily limit reached, or a premium-only endpoint
   *   - "Note"        — legacy per-minute throttle
   *   - "Error Message" — malformed request or unknown symbol
   *
   * Every parse below looks for its payload key and gives up quietly when it's
   * absent, so without this check a throttled response reads exactly like a
   * symbol that doesn't exist. Throwing makes the difference visible in the
   * logs and lets the nightly refresh report which assets it couldn't price.
   */
  private assertNoErrorEnvelope(data: AlphaVantageEnvelope): void {
    const throttled = data.Information ?? data.Note;
    if (typeof throttled === "string") {
      throw new ProviderRateLimitError(this.name, throttled);
    }
    const message = data["Error Message"];
    if (typeof message === "string") {
      throw new ProviderError(this.name, message);
    }
  }

  async getPrice(symbol: string, currency = "USD", date?: string): Promise<PriceResult | null> {
    if (date && date < isoToday()) {
      return this.getHistoricalPrice(symbol, currency, date);
    }
    return this.getCurrentPrice(symbol, currency);
  }

  private async getCurrentPrice(symbol: string, currency: string): Promise<PriceResult | null> {
    const url = new URL(BASE_URL);
    url.searchParams.set("function", "GLOBAL_QUOTE");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("apikey", this.apiKey);

    const res = await providerFetch(this.name, url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) return null;

    const data = (await res.json()) as AlphaVantageQuoteResponse;
    this.assertNoErrorEnvelope(data);
    const priceStr = data["Global Quote"]?.["05. price"];
    if (!priceStr) return null;

    const price = parseFloat(priceStr);
    if (isNaN(price)) return null;

    // GLOBAL_QUOTE carries no currency field, so the price is labelled with the
    // currency the caller asked for — which is the asset's configured currency,
    // pre-filled from SYMBOL_SEARCH's "8. currency" when the asset was created.
    // That makes the currency a user-asserted fact: an asset configured with the
    // wrong currency for its listing will cache a correctly-fetched price under
    // the wrong denomination, and no response field can detect it.
    return {
      symbol,
      price,
      currency: currency.toUpperCase(),
      date: isoToday(),
      provider: this.name,
    };
  }

  private async getHistoricalPrice(
    symbol: string,
    currency: string,
    date: string
  ): Promise<PriceResult | null> {
    const url = new URL(BASE_URL);
    url.searchParams.set("function", "TIME_SERIES_DAILY");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("outputsize", "compact");
    url.searchParams.set("apikey", this.apiKey);

    const res = await providerFetch(this.name, url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) return null;

    const data = (await res.json()) as AlphaVantageDailyResponse;
    this.assertNoErrorEnvelope(data);
    const series = data["Time Series (Daily)"];
    if (!series) return null;

    // Find closest date on or before requested
    const availableDates = Object.keys(series).sort().reverse();
    const closestDate = availableDates.find((d) => d <= date);
    if (!closestDate) return null;

    const closeStr = series[closestDate]?.["4. close"];
    if (!closeStr) return null;

    const price = parseFloat(closeStr);
    if (isNaN(price)) return null;

    return {
      symbol,
      price,
      currency: currency.toUpperCase(),
      date: closestDate,
      provider: this.name,
    };
  }

  async getPriceRange(
    symbol: string,
    currency = "USD",
    from: string,
    to: string
  ): Promise<PriceResult[]> {
    // Use full output to cover longer ranges
    const url = new URL(BASE_URL);
    url.searchParams.set("function", "TIME_SERIES_DAILY");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("outputsize", "full");
    url.searchParams.set("apikey", this.apiKey);

    const res = await providerFetch(this.name, url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) return [];

    const data = (await res.json()) as AlphaVantageDailyResponse;
    this.assertNoErrorEnvelope(data);
    const series = data["Time Series (Daily)"];
    if (!series) return [];

    const results: PriceResult[] = [];
    for (const [date, values] of Object.entries(series)) {
      if (date < from || date > to) continue;
      const closeStr = values["4. close"];
      if (!closeStr) continue;
      const price = parseFloat(closeStr);
      if (isNaN(price)) continue;
      results.push({
        symbol,
        price,
        currency: currency.toUpperCase(),
        date,
        provider: this.name,
      });
    }

    return results.sort((a, b) => a.date.localeCompare(b.date));
  }

  async searchSymbol(query: string): Promise<SymbolSearchResult[]> {
    const url = new URL(BASE_URL);
    url.searchParams.set("function", "SYMBOL_SEARCH");
    url.searchParams.set("keywords", query);
    url.searchParams.set("apikey", this.apiKey);

    const res = await providerFetch(this.name, url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) return [];

    const data = (await res.json()) as AlphaVantageSearchResponse;
    this.assertNoErrorEnvelope(data);
    if (!data.bestMatches?.length) return [];

    // Alpha Vantage SYMBOL_SEARCH responses include "8. currency" with the
    // listing's denomination currency — surface it so the asset form can
    // pre-fill the field.
    return data.bestMatches.slice(0, 10).map((m) => ({
      provider: this.name,
      symbol: m["1. symbol"] ?? "",
      name: `${m["2. name"] ?? ""} (${m["1. symbol"] ?? ""})`,
      type: m["3. type"]?.toLowerCase() ?? "stock",
      currency: m["8. currency"]?.toUpperCase(),
    }));
  }

  async healthCheck(): Promise<boolean> {
    try {
      const url = new URL(BASE_URL);
      url.searchParams.set("function", "GLOBAL_QUOTE");
      url.searchParams.set("symbol", "IBM");
      url.searchParams.set("apikey", this.apiKey);
      const res = await providerFetch(this.name, url.toString(), { next: { revalidate: 0 } });
      if (!res.ok) return false;
      const data = (await res.json()) as Record<string, unknown>;
      return "Global Quote" in data;
    } catch {
      return false;
    }
  }
}

/** Envelope keys Alpha Vantage returns instead of a payload. See assertNoErrorEnvelope. */
interface AlphaVantageEnvelope {
  Information?: unknown;
  Note?: unknown;
  "Error Message"?: unknown;
}

interface AlphaVantageSearchResponse extends AlphaVantageEnvelope {
  bestMatches?: Array<Record<string, string>>;
}

interface AlphaVantageQuoteResponse extends AlphaVantageEnvelope {
  "Global Quote"?: Record<string, string>;
}

interface AlphaVantageDailyResponse extends AlphaVantageEnvelope {
  "Time Series (Daily)"?: Record<string, Record<string, string>>;
}
