import { Temporal } from "@js-temporal/polyfill";

// ─── Base Currency Cache ──────────────────────────────────────────────────────

// Stored on globalThis so the value survives Next.js re-bundling across
// server components, API routes, and instrumentation — same pattern as the
// timezone cache in date-ranges.ts.
const g = globalThis as unknown as { __kintiBaseCurrency?: string };

const FALLBACK_BASE_CURRENCY = "EUR";

/**
 * Returns the cached base currency. Defaults to EUR until
 * setBaseCurrencyCache() is called by instrumentation or the client init.
 * Kinti is base-currency-immutable per database, so this value never changes
 * during a process lifetime once set.
 */
export function getBaseCurrency(): string {
  return g.__kintiBaseCurrency ?? FALLBACK_BASE_CURRENCY;
}

/** Set the cached base currency. Called at server startup from settings DB. */
export function setBaseCurrencyCache(currency: string): void {
  g.__kintiBaseCurrency = currency;
}

/** Clear the cached base currency. Used by tests. */
export function clearBaseCurrencyCache(): void {
  g.__kintiBaseCurrency = undefined;
}

// ─── Currency Formatting (per-currency) ───────────────────────────────────────

/**
 * Display locale used for currency formatting. Independent of the user's
 * system locale — keeps screenshots and tests reproducible. The currency
 * itself decides the symbol and the number of decimals.
 */
const DISPLAY_LOCALE = "de-DE";

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: string): Intl.NumberFormat {
  let f = formatterCache.get(currency);
  if (!f) {
    f = new Intl.NumberFormat(DISPLAY_LOCALE, { style: "currency", currency });
    formatterCache.set(currency, f);
  }
  return f;
}

const compactFormatterCache = new Map<string, Intl.NumberFormat>();

function getCompactFormatter(currency: string): Intl.NumberFormat {
  let f = compactFormatterCache.get(currency);
  if (!f) {
    f = new Intl.NumberFormat(DISPLAY_LOCALE, {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    });
    compactFormatterCache.set(currency, f);
  }
  return f;
}

/**
 * Format a monetary amount. Decimal precision is determined by the currency
 * itself via Intl (JPY = 0, USD/EUR = 2, BHD = 3, etc.) — never assume 2.
 *
 * Defaults to the configured base currency, which is correct for any value
 * that came out of a base-currency aggregation (reports, budgets, net worth,
 * cash balance). Pass an explicit `currency` for native amounts (per-asset,
 * per-transaction).
 */
export function formatCurrency(amount: number, currency: string = getBaseCurrency()): string {
  return getFormatter(currency).format(amount);
}

/**
 * Compact currency formatter for chart axes and tight UI labels.
 * Produces e.g. "1,2 Tsd. €" / "1.2K €" — suitable for Y-axis ticks where
 * the full `formatCurrency` output is too wide.
 */
export function formatCurrencyCompact(
  amount: number,
  currency: string = getBaseCurrency()
): string {
  return getCompactFormatter(currency).format(amount);
}

/**
 * Round an amount to its currency's natural precision. Use at service
 * boundaries where decimal noise from float math needs to be cleaned up.
 * Replaces the old hardcoded `Math.round(x * 100) / 100`.
 */
export function roundToCurrency(amount: number, currency: string = getBaseCurrency()): number {
  const fractionDigits = getFormatter(currency).resolvedOptions().maximumFractionDigits ?? 2;
  const factor = 10 ** fractionDigits;
  return Math.round(amount * factor) / factor;
}

/**
 * Format a unit price with appropriate precision.
 * Shows at least 2 decimals, but extends to show significant digits for small values.
 * e.g. 345.63 → "345.63", 0.86768 → "0.86768", 0.00000514 → "0.00000514"
 */
export function formatPrice(price: number): string {
  if (price === 0) return "0.00";
  if (price >= 0.01) return price.toFixed(Math.max(2, countDecimals(price)));
  // For very small prices, show all significant digits
  const s = price.toPrecision(3);
  return parseFloat(s).toString();
}

function countDecimals(n: number): number {
  const s = n.toString();
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : s.length - dot - 1;
}

/** Format a percentage with 1 decimal, e.g. 75.5 → "75.5%" */
export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** Format YYYY-MM to a short month name, e.g. "2026-03" → "Mar 2026" */
export function formatMonth(yearMonth: string): string {
  const d = Temporal.PlainYearMonth.from(yearMonth).toPlainDate({ day: 1 });
  return d.toLocaleString("en-US", { month: "short", year: "numeric" });
}

/** Format YYYY-MM-DD to a short date, e.g. "2026-03-18" → "Mar 18" */
export function formatDate(isoDate: string): string {
  const d = Temporal.PlainDate.from(isoDate);
  return d.toLocaleString("en-US", { month: "short", day: "numeric" });
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function ordinal(n: number): string {
  if (n >= 11 && n <= 13) return `${n}th`;
  const last = n % 10;
  if (last === 1) return `${n}st`;
  if (last === 2) return `${n}nd`;
  if (last === 3) return `${n}rd`;
  return `${n}th`;
}

/** Format recurring frequency + schedule to human-readable text. */
export function formatFrequency(item: {
  frequency: string;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  startDate: string;
}): string {
  switch (item.frequency) {
    case "daily":
      return "Daily";
    case "weekly": {
      const d = Temporal.PlainDate.from(item.startDate);
      const dow = item.dayOfWeek ?? d.dayOfWeek % 7; // Temporal: 1=Mon..7=Sun → convert to 0=Sun..6=Sat
      return `Weekly on ${DAY_NAMES[dow]}`;
    }
    case "monthly": {
      const dom = item.dayOfMonth ?? Temporal.PlainDate.from(item.startDate).day;
      return `Monthly on the ${ordinal(dom)}`;
    }
    case "yearly": {
      const d = Temporal.PlainDate.from(item.startDate);
      return `Yearly on ${d.toLocaleString("en-US", { month: "short", day: "numeric" })}`;
    }
    default:
      return item.frequency;
  }
}
