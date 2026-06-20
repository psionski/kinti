import type { PriceResult, FinancialDataProvider, SymbolSearchResult } from "./types";
import { isoToday } from "@/lib/date-ranges";

const BASE_URL = "https://v6.exchangerate-api.com/v6";

/**
 * ExchangeRate-API provider for forex rates.
 * 1,500 req/month on free tier. Requires an API key.
 * Supports 160+ currencies. Historical data on paid plans only.
 */
export class ExchangeRateApiProvider implements FinancialDataProvider {
  readonly name = "exchangerate-api";

  constructor(private apiKey: string) {}

  async getPrice(symbol: string, currency: string, date?: string): Promise<PriceResult | null> {
    // Free tier doesn't support historical — fall back to latest
    if (date && date < isoToday()) {
      return this.getHistoricalPrice(symbol, currency, date);
    }
    return this.getPairPrice(symbol, currency);
  }

  private async getPairPrice(symbol: string, currency: string): Promise<PriceResult | null> {
    const url = `${BASE_URL}/${this.apiKey}/pair/${encodeURIComponent(symbol)}/${encodeURIComponent(currency)}`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return null;

    const data = (await res.json()) as ExchangeRateApiPairResponse;
    if (data.result !== "success" || data.conversion_rate === undefined) return null;

    return {
      symbol,
      price: data.conversion_rate,
      currency,
      date: data.time_last_update_utc
        ? isoDateFromUtcString(data.time_last_update_utc)
        : isoToday(),
      provider: this.name,
    };
  }

  private async getHistoricalPrice(
    symbol: string,
    currency: string,
    date: string
  ): Promise<PriceResult | null> {
    // Historical endpoint: /v6/KEY/history/BASE/YEAR/MONTH/DAY
    const [year, month, day] = date.split("-");
    const url = `${BASE_URL}/${this.apiKey}/history/${encodeURIComponent(symbol)}/${year}/${month}/${day}`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) {
      // Historical not available on free tier — fall back to latest
      return this.getPairPrice(symbol, currency);
    }

    const data = (await res.json()) as ExchangeRateApiHistoryResponse;
    if (data.result !== "success" || !data.conversion_rates) return null;

    const rate = data.conversion_rates[currency];
    if (rate === undefined) return null;

    return {
      symbol,
      price: rate,
      currency,
      date,
      provider: this.name,
    };
  }

  async getPrices(symbol: string, date?: string): Promise<PriceResult[]> {
    if (date && date < isoToday()) {
      return this.getHistoricalPrices(symbol, date);
    }

    const url = `${BASE_URL}/${this.apiKey}/latest/${encodeURIComponent(symbol)}`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return [];

    const data = (await res.json()) as ExchangeRateApiStandardResponse;
    if (data.result !== "success" || !data.conversion_rates) return [];

    const rateDate = data.time_last_update_utc
      ? isoDateFromUtcString(data.time_last_update_utc)
      : isoToday();

    return Object.entries(data.conversion_rates)
      .filter(([code]) => code !== symbol)
      .map(([code, rate]) => ({
        symbol,
        price: rate,
        currency: code,
        date: rateDate,
        provider: this.name,
      }));
  }

  private async getHistoricalPrices(symbol: string, date: string): Promise<PriceResult[]> {
    const [year, month, day] = date.split("-");
    const url = `${BASE_URL}/${this.apiKey}/history/${encodeURIComponent(symbol)}/${year}/${month}/${day}`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return [];

    const data = (await res.json()) as ExchangeRateApiHistoryResponse;
    if (data.result !== "success" || !data.conversion_rates) return [];

    return Object.entries(data.conversion_rates)
      .filter(([code]) => code !== symbol)
      .map(([code, rate]) => ({
        symbol,
        price: rate,
        currency: code,
        date,
        provider: this.name,
      }));
  }

  async searchSymbol(query: string): Promise<SymbolSearchResult[]> {
    const url = `${BASE_URL}/${this.apiKey}/codes`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return [];

    const data = (await res.json()) as ExchangeRateApiCodesResponse;
    if (data.result !== "success" || !data.supported_codes) return [];

    const q = query.toUpperCase();
    return data.supported_codes
      .filter(([code, name]) => code.includes(q) || name.toUpperCase().includes(q))
      .slice(0, 20)
      .map(([code, name]) => ({
        provider: this.name,
        symbol: code,
        name,
        type: "currency",
        currency: code,
      }));
  }

  async healthCheck(): Promise<boolean> {
    try {
      const url = `${BASE_URL}/${this.apiKey}/pair/USD/EUR`;
      const res = await fetch(url, { next: { revalidate: 0 } });
      if (!res.ok) return false;
      const data = (await res.json()) as ExchangeRateApiPairResponse;
      return data.result === "success";
    } catch {
      return false;
    }
  }
}

/** Parse "Mon, 06 Apr 2026 00:00:01 +0000" → "2026-04-06" */
function isoDateFromUtcString(utcStr: string): string {
  const d = new Date(utcStr);
  if (isNaN(d.getTime())) return isoToday();
  return d.toISOString().slice(0, 10);
}

interface ExchangeRateApiPairResponse {
  result: string;
  conversion_rate?: number;
  time_last_update_utc?: string;
}

interface ExchangeRateApiStandardResponse {
  result: string;
  conversion_rates?: Record<string, number>;
  time_last_update_utc?: string;
}

interface ExchangeRateApiHistoryResponse {
  result: string;
  conversion_rates?: Record<string, number>;
}

interface ExchangeRateApiCodesResponse {
  result: string;
  supported_codes?: [string, string][];
}
