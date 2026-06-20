import type { PriceResult, FinancialDataProvider, SymbolSearchResult } from "./types";
import { isoDateFromMs } from "@/lib/date-ranges";

const BASE_URL = "https://openexchangerates.org/api";

/**
 * Open Exchange Rates provider.
 * Real-time rates, 170+ currencies. Requires a free-tier API key.
 * Free tier: 1,000 req/month, base currency locked to USD.
 */
export class OpenExchangeRatesProvider implements FinancialDataProvider {
  readonly name = "open-exchange-rates";

  constructor(private apiKey: string) {}

  async getPrice(symbol: string, currency: string, date?: string): Promise<PriceResult | null> {
    const prices = await this.getPrices(symbol, date);
    return prices.find((r) => r.currency === currency) ?? null;
  }

  async getPrices(symbol: string, date?: string): Promise<PriceResult[]> {
    // Free tier only supports USD as base; use USD as pivot
    const url = date
      ? `${BASE_URL}/historical/${date}.json?app_id=${this.apiKey}&base=USD`
      : `${BASE_URL}/latest.json?app_id=${this.apiKey}&base=USD`;

    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return [];

    const data = (await res.json()) as OerResponse;
    if (!data.rates) return [];

    // OER returns USD-based rates. Convert to requested base.
    const usdRates = new Map(Object.entries(data.rates));
    usdRates.set("USD", 1);

    const baseRate = usdRates.get(symbol);
    if (baseRate === undefined) return [];

    const rateDate = date ?? isoDateFromMs(data.timestamp * 1000);
    const results: PriceResult[] = [];

    for (const [currency, usdRate] of usdRates) {
      if (currency === symbol) continue;
      results.push({
        symbol,
        price: usdRate / baseRate,
        currency,
        date: rateDate,
        provider: this.name,
      });
    }

    return results;
  }

  async getPriceRange(
    symbol: string,
    currency: string,
    from: string,
    to: string
  ): Promise<PriceResult[]> {
    // OER free tier doesn't have a time-series endpoint, so fetch each date individually.
    // To limit API usage, cap at 30 days.
    const dates = generateDateRange(from, to, 30);
    const results: PriceResult[] = [];

    for (const date of dates) {
      const url = `${BASE_URL}/historical/${date}.json?app_id=${this.apiKey}&base=USD&symbols=USD,${symbol},${currency}`;
      const res = await fetch(url, { next: { revalidate: 0 } });
      if (!res.ok) continue;

      const data = (await res.json()) as OerResponse;
      if (!data.rates) continue;

      const usdRates = new Map(Object.entries(data.rates));
      usdRates.set("USD", 1);
      const baseRate = usdRates.get(symbol);
      const quoteRate = usdRates.get(currency);
      if (baseRate === undefined || quoteRate === undefined) continue;

      results.push({
        symbol,
        price: quoteRate / baseRate,
        currency,
        date,
        provider: this.name,
      });
    }

    return results;
  }

  async searchSymbol(query: string): Promise<SymbolSearchResult[]> {
    const url = `${BASE_URL}/currencies.json`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return [];

    const data = (await res.json()) as Record<string, string>;
    const q = query.toUpperCase();

    return Object.entries(data)
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
      const res = await fetch(`${BASE_URL}/latest.json?app_id=${this.apiKey}&symbols=EUR`, {
        next: { revalidate: 0 },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

/** Generate YYYY-MM-DD dates between from and to, capped at maxDays. */
function generateDateRange(from: string, to: string, maxDays: number): string[] {
  const dates: string[] = [];
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const start = new Date(fy, fm - 1, fd);
  const end = new Date(ty, tm - 1, td);

  const current = new Date(start);
  while (current <= end && dates.length < maxDays) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, "0");
    const d = String(current.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

interface OerResponse {
  timestamp: number;
  base: string;
  rates: Record<string, number>;
}
