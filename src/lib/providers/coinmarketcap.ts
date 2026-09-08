import type { PriceResult, FinancialDataProvider, SymbolSearchResult } from "./types";
import { isoToday } from "@/lib/date-ranges";
import { providerFetch } from "./rate-limit";

const BASE_URL = "https://pro-api.coinmarketcap.com";

/** Common fiat currencies to fetch alongside crypto prices. */
const COMMON_CONVERT_CURRENCIES = [
  "EUR",
  "USD",
  "GBP",
  "JPY",
  "CHF",
  "CAD",
  "AUD",
  "CNY",
  "KRW",
  "INR",
  "BRL",
  "BTC",
];

/**
 * CoinMarketCap provider for cryptocurrency prices.
 * Free tier: 10,000 calls/month. Requires an API key.
 * Uses slugs (e.g. "bitcoin") or symbols (e.g. "BTC") for lookups.
 */
export class CoinMarketCapProvider implements FinancialDataProvider {
  readonly name = "coinmarketcap";

  constructor(private apiKey: string) {}

  private headers(): Record<string, string> {
    return {
      "X-CMC_PRO_API_KEY": this.apiKey,
      Accept: "application/json",
    };
  }

  async getPrice(symbol: string, currency = "EUR", date?: string): Promise<PriceResult | null> {
    if (date && date < isoToday()) {
      return this.getHistoricalPrice(symbol, currency, date);
    }
    return this.getCurrentPrice(symbol, currency);
  }

  private async getCurrentPrice(symbol: string, currency: string): Promise<PriceResult | null> {
    const url = new URL(`${BASE_URL}/v2/cryptocurrency/quotes/latest`);
    url.searchParams.set("slug", symbol);
    url.searchParams.set("convert", currency.toUpperCase());

    const res = await providerFetch(this.name, url.toString(), {
      headers: this.headers(),
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as CmcQuotesResponse;
    if (data.status?.error_code !== 0) return null;

    // v2 returns data as { [id]: CoinData }
    const coins = Object.values(data.data ?? {});
    const coin = coins[0];
    if (!coin) return null;
    const cur = currency.toUpperCase();
    const quote = coin.quote?.[cur];
    if (!quote?.price) return null;

    return {
      symbol,
      price: quote.price,
      currency: cur,
      date: quote.last_updated ? quote.last_updated.slice(0, 10) : isoToday(),
      provider: this.name,
    };
  }

  private async getHistoricalPrice(
    symbol: string,
    currency: string,
    date: string
  ): Promise<PriceResult | null> {
    // v2/cryptocurrency/quotes/historical — requires paid plan, fall back to latest
    const url = new URL(`${BASE_URL}/v2/cryptocurrency/quotes/historical`);
    url.searchParams.set("slug", symbol);
    url.searchParams.set("convert", currency.toUpperCase());
    url.searchParams.set("time_start", date);
    url.searchParams.set("time_end", date);
    url.searchParams.set("count", "1");

    const res = await providerFetch(this.name, url.toString(), {
      headers: this.headers(),
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      // Historical not available on free tier — fall back to current price
      return this.getCurrentPrice(symbol, currency);
    }

    const data = (await res.json()) as CmcHistoricalResponse;
    if (data.status?.error_code !== 0) {
      return this.getCurrentPrice(symbol, currency);
    }

    const quotes = Object.values(data.data ?? {});
    const coinData = quotes[0];
    if (!coinData) return this.getCurrentPrice(symbol, currency);
    const quoteEntries = coinData.quotes;
    const quoteEntry = quoteEntries?.[0];
    if (!quoteEntry) return this.getCurrentPrice(symbol, currency);

    const cur = currency.toUpperCase();
    const price = quoteEntry.quote?.[cur]?.price;
    if (price === undefined) return this.getCurrentPrice(symbol, currency);

    return {
      symbol,
      price,
      currency: cur,
      date: quoteEntry.timestamp ? quoteEntry.timestamp.slice(0, 10) : date,
      provider: this.name,
    };
  }

  async getPrices(symbol: string, date?: string): Promise<PriceResult[]> {
    // Fetch price in all common currencies at once
    const convert = COMMON_CONVERT_CURRENCIES.join(",");
    const url = new URL(`${BASE_URL}/v2/cryptocurrency/quotes/latest`);
    url.searchParams.set("slug", symbol);
    url.searchParams.set("convert", convert);

    const res = await providerFetch(this.name, url.toString(), {
      headers: this.headers(),
      next: { revalidate: 0 },
    });
    if (!res.ok) return [];

    const data = (await res.json()) as CmcQuotesResponse;
    if (data.status?.error_code !== 0) return [];

    const coins = Object.values(data.data ?? {});
    const coin = coins[0];
    if (!coin) return [];
    const results: PriceResult[] = [];

    for (const cur of COMMON_CONVERT_CURRENCIES) {
      const quote = coin.quote?.[cur];
      if (!quote?.price) continue;
      results.push({
        symbol,
        price: quote.price,
        currency: cur,
        date: date ?? (quote.last_updated ? quote.last_updated.slice(0, 10) : isoToday()),
        provider: this.name,
      });
    }

    return results;
  }

  async searchSymbol(query: string): Promise<SymbolSearchResult[]> {
    const url = new URL(`${BASE_URL}/v1/cryptocurrency/map`);
    url.searchParams.set("listing_status", "active");
    url.searchParams.set("limit", "100");

    const res = await providerFetch(this.name, url.toString(), {
      headers: this.headers(),
      next: { revalidate: 0 },
    });
    if (!res.ok) return [];

    const data = (await res.json()) as CmcMapResponse;
    if (!data.data?.length) return [];

    const q = query.toLowerCase();
    return data.data
      .filter(
        (coin) =>
          coin.slug.includes(q) ||
          coin.name.toLowerCase().includes(q) ||
          coin.symbol.toLowerCase().includes(q)
      )
      .slice(0, 10)
      .map((coin) => ({
        provider: this.name,
        symbol: coin.slug,
        name: `${coin.name} (${coin.symbol})`,
        type: "crypto",
      }));
  }

  async healthCheck(): Promise<boolean> {
    try {
      const url = new URL(`${BASE_URL}/v1/cryptocurrency/map`);
      url.searchParams.set("limit", "1");
      const res = await providerFetch(this.name, url.toString(), {
        headers: this.headers(),
        next: { revalidate: 0 },
      });
      if (!res.ok) return false;
      const data = (await res.json()) as CmcMapResponse;
      return data.status?.error_code === 0;
    } catch {
      return false;
    }
  }
}

// ─── Response Types ──────────────────────────────────────────────────────────

interface CmcStatus {
  error_code: number;
  error_message?: string;
}

interface CmcQuote {
  price: number;
  last_updated?: string;
}

interface CmcCoinData {
  id: number;
  name: string;
  symbol: string;
  slug: string;
  quote?: Record<string, CmcQuote>;
}

interface CmcQuotesResponse {
  status?: CmcStatus;
  data?: Record<string, CmcCoinData>;
}

interface CmcHistoricalQuoteEntry {
  timestamp?: string;
  quote?: Record<string, CmcQuote>;
}

interface CmcHistoricalCoinData {
  id?: number;
  name?: string;
  symbol?: string;
  quotes?: CmcHistoricalQuoteEntry[];
}

interface CmcHistoricalResponse {
  status?: CmcStatus;
  data?: Record<string, CmcHistoricalCoinData>;
}

interface CmcMapCoin {
  id: number;
  name: string;
  symbol: string;
  slug: string;
}

interface CmcMapResponse {
  status?: CmcStatus;
  data?: CmcMapCoin[];
}
