import type { PriceResult, FinancialDataProvider, SymbolSearchResult, ProviderName } from "./types";
import { isoToday } from "@/lib/date-ranges";

const DAILY_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const HIST_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml";

/**
 * European Central Bank provider.
 * Provides daily EUR reference rates for ~30 currencies.
 * Rates are quoted as 1 EUR = X foreign currency, so we invert when base != EUR.
 * Historical data has a 1-day lag; current rates are published around 16:00 CET.
 */
export class EcbProvider implements FinancialDataProvider {
  readonly name = "ecb";

  async getPrice(symbol: string, currency: string, date?: string): Promise<PriceResult | null> {
    const prices = await this.getPrices(symbol, date);
    return prices.find((r) => r.currency === currency) ?? null;
  }

  async getPrices(symbol: string, date?: string): Promise<PriceResult[]> {
    const isHistorical = date && date < isoToday();
    const url = isHistorical ? HIST_URL : DAILY_URL;

    const res = await fetch(url, {
      headers: { Accept: "application/xml" },
      next: { revalidate: 0 },
    });
    if (!res.ok) return [];

    const xml = await res.text();
    const rateMap = parseEcbXml(xml, date);
    if (!rateMap) return [];

    // ECB publishes EUR-based rates (1 EUR = X currency).
    // Add EUR itself as a synthetic 1:1 rate.
    rateMap.set("EUR", 1);

    return buildResults(symbol, rateMap, date ?? latestDateFromXml(xml) ?? isoToday(), this.name);
  }

  async getPriceRange(
    symbol: string,
    currency: string,
    from: string,
    to: string
  ): Promise<PriceResult[]> {
    const res = await fetch(HIST_URL, {
      headers: { Accept: "application/xml" },
      next: { revalidate: 0 },
    });
    if (!res.ok) return [];

    const xml = await res.text();
    const dateCubes = parseEcbXmlRange(xml, from, to);
    if (dateCubes.length === 0) return [];

    const results: PriceResult[] = [];
    for (const { date, rates } of dateCubes) {
      rates.set("EUR", 1);
      const baseRate = rates.get(symbol);
      if (baseRate === undefined) continue;
      const quoteRate = rates.get(currency);
      if (quoteRate === undefined) continue;
      results.push({
        symbol,
        price: quoteRate / baseRate,
        currency,
        date,
        provider: this.name,
      });
    }

    return results.sort((a, b) => a.date.localeCompare(b.date));
  }

  async searchSymbol(query: string): Promise<SymbolSearchResult[]> {
    const res = await fetch(DAILY_URL, {
      headers: { Accept: "application/xml" },
      next: { revalidate: 0 },
    });
    if (!res.ok) return [];

    const xml = await res.text();
    const currencies = parseCurrencyList(xml);
    // Always include EUR (not in the XML as it's the base)
    currencies.set("EUR", "Euro");

    const q = query.toUpperCase();
    return Array.from(currencies.entries())
      .filter(([code, name]) => code.includes(q) || name.toUpperCase().includes(q))
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
      const res = await fetch(DAILY_URL, { method: "HEAD" });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// ─── XML Parsing ──────────────────────────────────────────────────────────────

function parseEcbXml(xml: string, date?: string): Map<string, number> | null {
  const cubeRegex = /<Cube\s+time=['"]([^'"]+)['"]\s*>([\s\S]*?)<\/Cube>/g;
  let best: { date: string; content: string } | null = null;

  let m: RegExpExecArray | null;
  while ((m = cubeRegex.exec(xml)) !== null) {
    const cubeDate = m[1];
    const content = m[2];
    if (date) {
      if (cubeDate === date) {
        best = { date: cubeDate, content };
        break;
      }
      if (cubeDate <= date) {
        if (!best || cubeDate > best.date) {
          best = { date: cubeDate, content };
        }
      }
    } else {
      if (!best || cubeDate > best.date) {
        best = { date: cubeDate, content };
      }
    }
  }

  if (!best) return null;

  const rateMap = new Map<string, number>();
  const rateRegex = /<Cube\s+currency=['"]([A-Z]+)['"]\s+rate=['"]([^'"]+)['"]\s*\/>/g;
  let r: RegExpExecArray | null;
  while ((r = rateRegex.exec(best.content)) !== null) {
    rateMap.set(r[1], parseFloat(r[2]));
  }

  return rateMap;
}

function latestDateFromXml(xml: string): string | null {
  const m = /<Cube\s+time=['"]([^'"]+)['"]/.exec(xml);
  return m ? m[1] : null;
}

function parseEcbXmlRange(
  xml: string,
  from: string,
  to: string
): Array<{ date: string; rates: Map<string, number> }> {
  const cubeRegex = /<Cube\s+time=['"]([^'"]+)['"]\s*>([\s\S]*?)<\/Cube>/g;
  const results: Array<{ date: string; rates: Map<string, number> }> = [];

  let m: RegExpExecArray | null;
  while ((m = cubeRegex.exec(xml)) !== null) {
    const cubeDate = m[1];
    if (cubeDate < from || cubeDate > to) continue;

    const rateMap = new Map<string, number>();
    const rateRegex = /<Cube\s+currency=['"]([A-Z]+)['"]\s+rate=['"]([^'"]+)['"]\s*\/>/g;
    let r: RegExpExecArray | null;
    while ((r = rateRegex.exec(m[2])) !== null) {
      rateMap.set(r[1], parseFloat(r[2]));
    }
    results.push({ date: cubeDate, rates: rateMap });
  }

  return results;
}

/** ECB doesn't publish currency names in the rate feed, so we use code-only names. */
const ECB_CURRENCY_NAMES: Record<string, string> = {
  USD: "US Dollar",
  JPY: "Japanese Yen",
  BGN: "Bulgarian Lev",
  CZK: "Czech Koruna",
  DKK: "Danish Krone",
  GBP: "Pound Sterling",
  HUF: "Hungarian Forint",
  PLN: "Polish Zloty",
  RON: "Romanian Leu",
  SEK: "Swedish Krona",
  CHF: "Swiss Franc",
  ISK: "Icelandic Króna",
  NOK: "Norwegian Krone",
  TRY: "Turkish Lira",
  AUD: "Australian Dollar",
  BRL: "Brazilian Real",
  CAD: "Canadian Dollar",
  CNY: "Chinese Yuan",
  HKD: "Hong Kong Dollar",
  IDR: "Indonesian Rupiah",
  ILS: "Israeli Shekel",
  INR: "Indian Rupee",
  KRW: "South Korean Won",
  MXN: "Mexican Peso",
  MYR: "Malaysian Ringgit",
  NZD: "New Zealand Dollar",
  PHP: "Philippine Peso",
  SGD: "Singapore Dollar",
  THB: "Thai Baht",
  ZAR: "South African Rand",
  EUR: "Euro",
};

function parseCurrencyList(xml: string): Map<string, string> {
  const currencies = new Map<string, string>();
  const rateRegex = /<Cube\s+currency=['"]([A-Z]+)['"]\s+rate=['"][^'"]+['"]\s*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = rateRegex.exec(xml)) !== null) {
    const code = m[1];
    currencies.set(code, ECB_CURRENCY_NAMES[code] ?? code);
  }
  return currencies;
}

// ─── Rate Conversion ──────────────────────────────────────────────────────────

function buildResults(
  symbol: string,
  eurRates: Map<string, number>,
  date: string,
  provider: ProviderName
): PriceResult[] {
  const baseInEur = eurRates.get(symbol);
  if (baseInEur === undefined) return [];

  const results: PriceResult[] = [];
  for (const [currency, eurRate] of eurRates) {
    if (currency === symbol) continue;
    results.push({
      symbol,
      price: eurRate / baseInEur,
      currency,
      date,
      provider,
    });
  }
  return results;
}
