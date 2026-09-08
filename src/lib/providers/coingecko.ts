import { Temporal } from "@js-temporal/polyfill";
import type { PriceResult, FinancialDataProvider, SymbolSearchResult } from "./types";
import { isoToday } from "@/lib/date-ranges";
import { providerFetch } from "./rate-limit";

const BASE_URL = "https://api.coingecko.com/api/v3";
const PRO_URL = "https://pro-api.coingecko.com/api/v3";

/** Common fiat currencies for getPrices bulk fetch. */
const COMMON_VS_CURRENCIES = [
  "eur",
  "usd",
  "gbp",
  "jpy",
  "chf",
  "cad",
  "aud",
  "cny",
  "krw",
  "inr",
  "brl",
  "rub",
  "try",
  "sek",
  "nok",
  "dkk",
  "pln",
  "czk",
  "huf",
  "btc",
];

/**
 * CoinGecko provider for crypto prices.
 * Free tier: ~30 req/min, no API key required.
 * Optional pro key for higher rate limits.
 */
export class CoinGeckoProvider implements FinancialDataProvider {
  readonly name = "coingecko";

  private baseUrl: string;

  constructor(private apiKey?: string) {
    this.baseUrl = apiKey ? PRO_URL : BASE_URL;
  }

  async getPrice(symbol: string, currency = "eur", date?: string): Promise<PriceResult | null> {
    const vs = currency.toLowerCase();

    if (date && date < isoToday()) {
      return this.getHistoricalPrice(symbol, vs, date);
    }

    return this.getCurrentPrice(symbol, vs);
  }

  private async getCurrentPrice(symbol: string, vs: string): Promise<PriceResult | null> {
    const url = new URL(`${this.baseUrl}/simple/price`);
    url.searchParams.set("ids", symbol);
    url.searchParams.set("vs_currencies", vs);
    if (this.apiKey) url.searchParams.set("x_cg_pro_api_key", this.apiKey);

    const res = await providerFetch(this.name, url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) return null;

    const data = (await res.json()) as Record<string, Record<string, number>>;
    const price = data[symbol]?.[vs];
    if (price === undefined) return null;

    return {
      symbol,
      price,
      currency: vs.toUpperCase(),
      date: isoToday(),
      provider: this.name,
    };
  }

  private async getHistoricalPrice(
    symbol: string,
    vs: string,
    date: string
  ): Promise<PriceResult | null> {
    // CoinGecko historical endpoint uses DD-MM-YYYY format
    const [y, mo, d] = date.split("-");
    const cgDate = `${d}-${mo}-${y}`;

    const url = new URL(`${this.baseUrl}/coins/${symbol}/history`);
    url.searchParams.set("date", cgDate);
    url.searchParams.set("localization", "false");
    if (this.apiKey) url.searchParams.set("x_cg_pro_api_key", this.apiKey);

    const res = await providerFetch(this.name, url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) return null;

    const data = (await res.json()) as CoinGeckoHistoryResponse;
    const price = data.market_data?.current_price?.[vs];
    if (price === undefined) return null;

    return {
      symbol,
      price,
      currency: vs.toUpperCase(),
      date,
      provider: this.name,
    };
  }

  async getPrices(symbol: string, date?: string): Promise<PriceResult[]> {
    if (date && date < isoToday()) {
      return this.getHistoricalPrices(symbol, date);
    }

    // CoinGecko /simple/price supports multiple vs_currencies
    const vsCurrencies = COMMON_VS_CURRENCIES.join(",");
    const url = new URL(`${this.baseUrl}/simple/price`);
    url.searchParams.set("ids", symbol);
    url.searchParams.set("vs_currencies", vsCurrencies);
    if (this.apiKey) url.searchParams.set("x_cg_pro_api_key", this.apiKey);

    const res = await providerFetch(this.name, url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) return [];

    const data = (await res.json()) as Record<string, Record<string, number>>;
    const prices = data[symbol];
    if (!prices) return [];

    return Object.entries(prices).map(([vs, price]) => ({
      symbol,
      price,
      currency: vs.toUpperCase(),
      date: isoToday(),
      provider: this.name,
    }));
  }

  private async getHistoricalPrices(symbol: string, date: string): Promise<PriceResult[]> {
    const [y, mo, d] = date.split("-");
    const cgDate = `${d}-${mo}-${y}`;

    const url = new URL(`${this.baseUrl}/coins/${symbol}/history`);
    url.searchParams.set("date", cgDate);
    url.searchParams.set("localization", "false");
    if (this.apiKey) url.searchParams.set("x_cg_pro_api_key", this.apiKey);

    const res = await providerFetch(this.name, url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) return [];

    const data = (await res.json()) as CoinGeckoHistoryResponse;
    const currentPrice = data.market_data?.current_price;
    if (!currentPrice) return [];

    return Object.entries(currentPrice).map(([vs, price]) => ({
      symbol,
      price,
      currency: vs.toUpperCase(),
      date,
      provider: this.name,
    }));
  }

  async getPriceRange(
    symbol: string,
    currency = "eur",
    from: string,
    to: string
  ): Promise<PriceResult[]> {
    const vs = currency.toLowerCase();
    // CoinGecko /market_chart/range uses unix timestamps
    const fromTs = Math.floor(Temporal.Instant.from(from + "T00:00:00Z").epochMilliseconds / 1000);
    const toTs = Math.floor(Temporal.Instant.from(to + "T23:59:59Z").epochMilliseconds / 1000);

    const url = new URL(`${this.baseUrl}/coins/${symbol}/market_chart/range`);
    url.searchParams.set("vs_currency", vs);
    url.searchParams.set("from", String(fromTs));
    url.searchParams.set("to", String(toTs));
    if (this.apiKey) url.searchParams.set("x_cg_pro_api_key", this.apiKey);

    const res = await providerFetch(this.name, url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) return [];

    const data = (await res.json()) as CoinGeckoRangeResponse;
    if (!data.prices?.length) return [];

    // CoinGecko returns [timestamp_ms, price] pairs — deduplicate to one per day
    const dayMap = new Map<string, number>();
    for (const [ts, price] of data.prices) {
      const dateStr = Temporal.Instant.fromEpochMilliseconds(ts).toString().slice(0, 10);
      dayMap.set(dateStr, price); // last value wins (intraday → closing)
    }

    return Array.from(dayMap.entries()).map(([date, price]) => ({
      symbol,
      price,
      currency: vs.toUpperCase(),
      date,
      provider: this.name,
    }));
  }

  async searchSymbol(query: string): Promise<SymbolSearchResult[]> {
    const url = new URL(`${this.baseUrl}/search`);
    url.searchParams.set("query", query);
    if (this.apiKey) url.searchParams.set("x_cg_pro_api_key", this.apiKey);

    const res = await providerFetch(this.name, url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) return [];

    const data = (await res.json()) as CoinGeckoSearchResponse;
    if (!data.coins?.length) return [];

    return data.coins.slice(0, 10).map((coin) => ({
      provider: this.name,
      symbol: coin.id,
      name: `${coin.name} (${coin.symbol.toUpperCase()})`,
      type: "crypto",
    }));
  }

  async healthCheck(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/ping${this.apiKey ? `?x_cg_pro_api_key=${this.apiKey}` : ""}`;
      const res = await providerFetch(this.name, url, { next: { revalidate: 0 } });
      return res.ok;
    } catch {
      return false;
    }
  }
}

interface CoinGeckoHistoryResponse {
  market_data?: {
    current_price?: Record<string, number>;
  };
}

interface CoinGeckoSearchResponse {
  coins?: Array<{ id: string; name: string; symbol: string }>;
}

interface CoinGeckoRangeResponse {
  prices?: [number, number][]; // [timestamp_ms, price]
}
