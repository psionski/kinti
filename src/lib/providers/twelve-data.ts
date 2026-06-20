import type { PriceResult, FinancialDataProvider, SymbolSearchResult } from "./types";
import { isoToday } from "@/lib/date-ranges";

const BASE_URL = "https://api.twelvedata.com";

/**
 * Twelve Data provider for stocks, ETFs, forex, and crypto.
 * Free tier: 8 API credits/minute, 800/day. Requires an API key.
 * Covers 100k+ symbols across 50+ countries.
 */
export class TwelveDataProvider implements FinancialDataProvider {
  readonly name = "twelve-data";

  constructor(private apiKey: string) {}

  async getPrice(symbol: string, currency?: string, date?: string): Promise<PriceResult | null> {
    if (date && date < isoToday()) {
      return this.getHistoricalPrice(symbol, currency, date);
    }
    return this.getCurrentPrice(symbol, currency);
  }

  private async getCurrentPrice(symbol: string, currency?: string): Promise<PriceResult | null> {
    const url = new URL(`${BASE_URL}/quote`);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("apikey", this.apiKey);

    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) return null;

    const data = (await res.json()) as TwelveDataQuoteResponse;
    if (data.status === "error" || !data.close) return null;

    const price = parseFloat(data.close);
    if (isNaN(price)) return null;

    return {
      symbol,
      price,
      currency: currency?.toUpperCase() ?? data.currency?.toUpperCase() ?? "USD",
      date: data.datetime?.slice(0, 10) ?? isoToday(),
      provider: this.name,
    };
  }

  private async getHistoricalPrice(
    symbol: string,
    currency: string | undefined,
    date: string
  ): Promise<PriceResult | null> {
    const url = new URL(`${BASE_URL}/time_series`);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", "1day");
    url.searchParams.set("start_date", date);
    url.searchParams.set("end_date", date);
    url.searchParams.set("outputsize", "1");
    url.searchParams.set("apikey", this.apiKey);

    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) return null;

    const data = (await res.json()) as TwelveDataTimeSeriesResponse;
    if (data.status === "error" || !data.values?.length) return null;

    const point = data.values[0];
    const price = parseFloat(point.close);
    if (isNaN(price)) return null;

    return {
      symbol,
      price,
      currency: currency?.toUpperCase() ?? data.meta?.currency?.toUpperCase() ?? "USD",
      date: point.datetime.slice(0, 10),
      provider: this.name,
    };
  }

  async getPriceRange(
    symbol: string,
    currency = "USD",
    from: string,
    to: string
  ): Promise<PriceResult[]> {
    const url = new URL(`${BASE_URL}/time_series`);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", "1day");
    url.searchParams.set("start_date", from);
    url.searchParams.set("end_date", to);
    url.searchParams.set("outputsize", "5000");
    url.searchParams.set("apikey", this.apiKey);

    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) return [];

    const data = (await res.json()) as TwelveDataTimeSeriesResponse;
    if (data.status === "error" || !data.values?.length) return [];

    const cur = data.meta?.currency?.toUpperCase() ?? currency.toUpperCase();

    const results: PriceResult[] = [];
    for (const point of data.values) {
      const price = parseFloat(point.close);
      if (isNaN(price)) continue;
      results.push({
        symbol,
        price,
        currency: cur,
        date: point.datetime.slice(0, 10),
        provider: this.name,
      });
    }
    return results.sort((a, b) => a.date.localeCompare(b.date));
  }

  async searchSymbol(query: string): Promise<SymbolSearchResult[]> {
    const url = new URL(`${BASE_URL}/symbol_search`);
    url.searchParams.set("symbol", query);
    url.searchParams.set("outputsize", "15");
    url.searchParams.set("apikey", this.apiKey);

    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) return [];

    const data = (await res.json()) as TwelveDataSearchResponse;
    if (!data.data?.length) return [];

    return data.data.slice(0, 10).map((item) => ({
      provider: this.name,
      symbol: item.symbol,
      name: `${item.instrument_name} (${item.symbol})`,
      type: mapInstrumentType(item.instrument_type),
      currency: item.currency?.toUpperCase(),
    }));
  }

  async healthCheck(): Promise<boolean> {
    try {
      const url = new URL(`${BASE_URL}/quote`);
      url.searchParams.set("symbol", "AAPL");
      url.searchParams.set("apikey", this.apiKey);
      const res = await fetch(url.toString(), { next: { revalidate: 0 } });
      if (!res.ok) return false;
      const data = (await res.json()) as TwelveDataQuoteResponse;
      return data.status !== "error";
    } catch {
      return false;
    }
  }
}

function mapInstrumentType(type?: string): string {
  if (!type) return "stock";
  const lower = type.toLowerCase();
  if (lower.includes("etf")) return "etf";
  if (lower.includes("crypto") || lower.includes("digital")) return "crypto";
  if (lower.includes("forex") || lower.includes("currency")) return "currency";
  if (lower.includes("index") || lower.includes("indice")) return "index";
  if (lower.includes("fund") || lower.includes("mutual")) return "fund";
  return "stock";
}

interface TwelveDataQuoteResponse {
  status?: string;
  symbol?: string;
  name?: string;
  currency?: string;
  datetime?: string;
  close?: string;
}

interface TwelveDataTimeSeriesResponse {
  status?: string;
  meta?: {
    symbol?: string;
    currency?: string;
  };
  values?: Array<{
    datetime: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume?: string;
  }>;
}

interface TwelveDataSearchResponse {
  data?: Array<{
    symbol: string;
    instrument_name: string;
    exchange?: string;
    mic_code?: string;
    instrument_type?: string;
    country?: string;
    currency?: string;
  }>;
  status?: string;
}
