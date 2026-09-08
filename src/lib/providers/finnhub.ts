import { Temporal } from "@js-temporal/polyfill";
import type { PriceResult, FinancialDataProvider, SymbolSearchResult } from "./types";
import { isoToday } from "@/lib/date-ranges";
import { providerFetch } from "./rate-limit";

const BASE_URL = "https://finnhub.io/api/v1";

/**
 * Finnhub provider for stocks and ETFs.
 * Free tier: 60 API calls/minute. Requires an API key.
 * Real-time US stock prices, company news, and basic fundamentals.
 */
export class FinnhubProvider implements FinancialDataProvider {
  readonly name = "finnhub";

  constructor(private apiKey: string) {}

  async getPrice(symbol: string, currency = "USD", date?: string): Promise<PriceResult | null> {
    if (date && date < isoToday()) {
      return this.getHistoricalPrice(symbol, currency, date);
    }
    return this.getCurrentPrice(symbol, currency);
  }

  private async getCurrentPrice(symbol: string, currency: string): Promise<PriceResult | null> {
    const url = new URL(`${BASE_URL}/quote`);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("token", this.apiKey);

    const res = await providerFetch(this.name, url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) return null;

    const data = (await res.json()) as FinnhubQuoteResponse;
    // c=0 typically means no data for this symbol
    if (data.c === undefined || data.c === 0) return null;

    return {
      symbol,
      price: data.c,
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
    // Use stock/candle with daily resolution for historical data
    const fromTs = Math.floor(Temporal.Instant.from(date + "T00:00:00Z").epochMilliseconds / 1000);
    const toTs = Math.floor(Temporal.Instant.from(date + "T23:59:59Z").epochMilliseconds / 1000);

    const url = new URL(`${BASE_URL}/stock/candle`);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("resolution", "D");
    url.searchParams.set("from", String(fromTs));
    url.searchParams.set("to", String(toTs));
    url.searchParams.set("token", this.apiKey);

    const res = await providerFetch(this.name, url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) return null;

    const data = (await res.json()) as FinnhubCandleResponse;
    if (data.s !== "ok" || !data.c?.length) return null;

    // Use the last close price in the range. data.c is non-empty (checked above),
    // so the last element is provably present.
    const price = data.c[data.c.length - 1]!;
    const timestamp = data.t?.[data.t.length - 1];
    const resultDate = timestamp
      ? Temporal.Instant.fromEpochMilliseconds(timestamp * 1000)
          .toString()
          .slice(0, 10)
      : date;

    return {
      symbol,
      price,
      currency: currency.toUpperCase(),
      date: resultDate,
      provider: this.name,
    };
  }

  async getPriceRange(
    symbol: string,
    currency = "USD",
    from: string,
    to: string
  ): Promise<PriceResult[]> {
    const fromTs = Math.floor(Temporal.Instant.from(from + "T00:00:00Z").epochMilliseconds / 1000);
    const toTs = Math.floor(Temporal.Instant.from(to + "T23:59:59Z").epochMilliseconds / 1000);

    const url = new URL(`${BASE_URL}/stock/candle`);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("resolution", "D");
    url.searchParams.set("from", String(fromTs));
    url.searchParams.set("to", String(toTs));
    url.searchParams.set("token", this.apiKey);

    const res = await providerFetch(this.name, url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) return [];

    const data = (await res.json()) as FinnhubCandleResponse;
    if (data.s !== "ok" || !data.c?.length || !data.t?.length) return [];

    const results: PriceResult[] = [];
    for (let i = 0; i < data.c.length; i++) {
      // i < data.c.length, so data.c[i] is provably present.
      const price = data.c[i]!;
      const timestamp = data.t[i];
      if (timestamp === undefined) continue;
      const dateStr = Temporal.Instant.fromEpochMilliseconds(timestamp * 1000)
        .toString()
        .slice(0, 10);

      if (dateStr < from || dateStr > to) continue;

      results.push({
        symbol,
        price,
        currency: currency.toUpperCase(),
        date: dateStr,
        provider: this.name,
      });
    }

    return results.sort((a, b) => a.date.localeCompare(b.date));
  }

  async searchSymbol(query: string): Promise<SymbolSearchResult[]> {
    const url = new URL(`${BASE_URL}/search`);
    url.searchParams.set("q", query);
    url.searchParams.set("token", this.apiKey);

    const res = await providerFetch(this.name, url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) return [];

    const data = (await res.json()) as FinnhubSearchResponse;
    if (!data.result?.length) return [];

    return data.result.slice(0, 10).map((item) => ({
      provider: this.name,
      symbol: item.symbol,
      name: `${item.description} (${item.displaySymbol})`,
      type: mapFinnhubType(item.type),
    }));
  }

  async healthCheck(): Promise<boolean> {
    try {
      const url = new URL(`${BASE_URL}/quote`);
      url.searchParams.set("symbol", "AAPL");
      url.searchParams.set("token", this.apiKey);
      const res = await providerFetch(this.name, url.toString(), { next: { revalidate: 0 } });
      if (!res.ok) return false;
      const data = (await res.json()) as FinnhubQuoteResponse;
      return data.c !== undefined && data.c > 0;
    } catch {
      return false;
    }
  }
}

function mapFinnhubType(type?: string): string {
  if (!type) return "stock";
  const lower = type.toLowerCase();
  if (lower.includes("etf") || lower === "etp") return "etf";
  if (lower.includes("reit")) return "reit";
  if (lower.includes("adr")) return "adr";
  if (lower.includes("fund") || lower === "unit") return "fund";
  return "stock";
}

interface FinnhubQuoteResponse {
  c?: number; // Current price
  d?: number; // Change
  dp?: number; // Percent change
  h?: number; // High price of the day
  l?: number; // Low price of the day
  o?: number; // Open price of the day
  pc?: number; // Previous close price
}

interface FinnhubCandleResponse {
  c?: number[]; // Close prices
  h?: number[]; // High prices
  l?: number[]; // Low prices
  o?: number[]; // Open prices
  t?: number[]; // Timestamps (UNIX)
  v?: number[]; // Volumes
  s?: string; // Status: "ok" | "no_data"
}

interface FinnhubSearchResponse {
  count?: number;
  result?: Array<{
    description: string;
    displaySymbol: string;
    symbol: string;
    type?: string;
  }>;
}
