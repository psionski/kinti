import type { PriceResult, FinancialDataProvider, SymbolSearchResult } from "./types";
import { isoToday } from "@/lib/date-ranges";

/**
 * fawazahmed0/exchange-api — free, CC0-licensed, no API key, no rate limits.
 * Static daily JSON files served from jsDelivr CDN. Covers 200+ currencies
 * including crypto and metals. Used as a fallback when Frankfurter has no
 * rate for an exotic currency (IDR, NGN, VND) or for pairs ECB suspended
 * (EUR/RUB).
 *
 * Data shape:
 *   GET https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@<date>/v1/currencies/<base>.json
 * → { date: "YYYY-MM-DD", <base>: { <quote>: <rate>, ... } }
 *
 * Where <date> is "latest" or a YYYY-MM-DD string, and <base>/<quote> are
 * lowercase currency codes (e.g. "usd", "eur", "btc").
 */
export class FawazahmedProvider implements FinancialDataProvider {
  readonly name = "fawazahmed";

  async getPrice(symbol: string, currency: string, date?: string): Promise<PriceResult | null> {
    const data = await this.fetchBase(symbol, date);
    if (!data) return null;
    const rate = data.rates[currency.toLowerCase()];
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
    const data = await this.fetchBase(symbol, date);
    if (!data) return [];
    return Object.entries(data.rates)
      .filter(([code]) => code !== symbol.toLowerCase())
      .map(([code, rate]) => ({
        symbol,
        price: rate,
        currency: code.toUpperCase(),
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
    // No range endpoint — fetch each day individually. The CDN files are
    // immutable and globally cached, so this is cheap. Cap at 31 days to
    // avoid spamming the API for huge backfills (the regular cron will
    // catch up over time).
    const results: PriceResult[] = [];
    const limit = 31;
    let count = 0;
    let cursor = from;
    while (cursor <= to && count < limit) {
      const r = await this.getPrice(symbol, currency, cursor);
      if (r) results.push(r);
      cursor = nextDay(cursor);
      count++;
    }
    return results;
  }

  async searchSymbol(query: string): Promise<SymbolSearchResult[]> {
    const url = `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies.json`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return [];
    const data = (await res.json()) as Record<string, string>;
    const q = query.toLowerCase();
    return Object.entries(data)
      .filter(([code, name]) => code.includes(q) || name.toLowerCase().includes(q))
      .slice(0, 20)
      .map(([code, name]) => ({
        provider: this.name,
        symbol: code.toUpperCase(),
        name,
        type: "currency",
        // FX provider — the symbol *is* the listing currency.
        currency: code.toUpperCase(),
      }));
  }

  async healthCheck(): Promise<boolean> {
    try {
      const data = await this.fetchBase("usd");
      return data !== null && Object.keys(data.rates).length > 0;
    } catch {
      return false;
    }
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private async fetchBase(
    symbol: string,
    date?: string
  ): Promise<{ date: string; rates: Record<string, number> } | null> {
    const tag = date ?? "latest";
    const lower = symbol.toLowerCase();
    // Primary CDN: jsDelivr. Cloudflare mirror would be the obvious failover,
    // but jsDelivr is reliable enough that we keep this single-source.
    const url = `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${tag}/v1/currencies/${encodeURIComponent(lower)}.json`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return null;
    const json = (await res.json()) as { date?: string } & Record<string, unknown>;
    const rates = json[lower];
    if (typeof rates !== "object" || rates === null) return null;
    return {
      date: typeof json.date === "string" ? json.date : (date ?? isoToday()),
      rates: rates as Record<string, number>,
    };
  }
}

/** Increment a YYYY-MM-DD string by one day without using Date(). */
function nextDay(iso: string): string {
  // Use Temporal to be consistent with the rest of the codebase, but inline
  // a tiny implementation here to avoid pulling Temporal into a hot path
  // for what amounts to "+1 day on a string". The Date object is acceptable
  // for pure date arithmetic with no timezone semantics.
  const [y, m, d] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
}
