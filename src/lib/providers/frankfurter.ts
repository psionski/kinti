import type { PriceResult, FinancialDataProvider, SymbolSearchResult } from "./types";

const BASE_URL = "https://api.frankfurter.app";

/**
 * Frankfurter API provider.
 * Wraps ECB data with a clean REST JSON interface.
 * Free, no API key, historical data back to 1999.
 */
export class FrankfurterProvider implements FinancialDataProvider {
  readonly name = "frankfurter";

  async getPrice(symbol: string, currency: string, date?: string): Promise<PriceResult | null> {
    const endpoint = date ? `${BASE_URL}/${date}` : `${BASE_URL}/latest`;
    const url = `${endpoint}?from=${encodeURIComponent(symbol)}&to=${encodeURIComponent(currency)}`;

    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return null;

    const data = (await res.json()) as FrankfurterResponse;
    const rate = data.rates?.[currency];
    if (rate === undefined) return null;

    return {
      symbol,
      price: rate,
      currency,
      date: data.date,
      provider: this.name,
    };
  }

  async getPrices(symbol: string, date?: string): Promise<PriceResult[]> {
    const endpoint = date ? `${BASE_URL}/${date}` : `${BASE_URL}/latest`;
    const url = `${endpoint}?from=${encodeURIComponent(symbol)}`;

    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return [];

    const data = (await res.json()) as FrankfurterResponse;
    if (!data.rates) return [];

    return Object.entries(data.rates).map(([currency, rate]) => ({
      symbol,
      price: rate,
      currency,
      date: data.date,
      provider: this.name,
    }));
  }

  async getPriceRange(
    symbol: string,
    currency: string,
    from: string,
    to: string
  ): Promise<PriceResult[]> {
    const url = `${BASE_URL}/${from}..${to}?from=${encodeURIComponent(symbol)}&to=${encodeURIComponent(currency)}`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return [];

    const data = (await res.json()) as FrankfurterTimeseriesResponse;
    if (!data.rates) return [];

    return Object.entries(data.rates).map(([date, rates]) => ({
      symbol,
      price: rates[currency],
      currency,
      date,
      provider: this.name,
    }));
  }

  async searchSymbol(query: string): Promise<SymbolSearchResult[]> {
    const res = await fetch(`${BASE_URL}/currencies`);
    if (!res.ok) return [];
    const data = (await res.json()) as Record<string, string>;
    const q = query.toUpperCase();
    return Object.entries(data)
      .filter(([code, name]) => code.includes(q) || name.toUpperCase().includes(q))
      .map(([code, name]) => ({
        provider: this.name,
        symbol: code,
        name,
        type: "currency",
        // For an FX provider the symbol *is* the listing currency.
        currency: code,
      }));
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${BASE_URL}/latest?from=EUR&to=USD`, {
        next: { revalidate: 0 },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

interface FrankfurterResponse {
  date: string;
  base: string;
  rates: Record<string, number>;
}

interface FrankfurterTimeseriesResponse {
  base: string;
  start_date: string;
  end_date: string;
  rates: Record<string, Record<string, number>>;
}
