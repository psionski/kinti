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

// ─── Prices ───────────────────────────────────────────────────────────────────

/*
 * Three formatters cover money. Picking the wrong one is a correctness bug, not
 * a cosmetic one:
 *
 *   formatCurrency(amount, currency?)  — an amount of money: totals, balances,
 *       cost basis, P&L. Uses the currency's own precision, via Intl (2 for
 *       EUR, 0 for JPY, 3 for BHD).
 *
 *   formatUnitPrice(price, currency?)  — the price of one unit: quotes, manual
 *       marks, lot fills. Presented like formatCurrency, but with variable
 *       precision, because a unit price can be finer than its currency's scale.
 *
 *   priceInputValue(price)             — the value of a number <input>. Bare
 *       digits, "." decimal separator, no symbol or grouping. Never render it
 *       as text: it ignores the display locale.
 *
 * The last two must not be swapped. `parseFloat("89.000,00 €")` is 89, not
 * 89000 — parseFloat stops at the first "." and reads it as the decimal point —
 * so a display string in an input silently books a value off by 1000×, and the
 * input rejects it outright as non-numeric. A raw string in the UI is merely
 * ugly: "89000.00" sitting beside "628,00 €".
 */

/**
 * A price as the value of a number `<input>` — see the note above.
 *
 * At least 2 decimals, extended to keep the significant digits of small values.
 * e.g. 345.63 → "345.63", 0.86768 → "0.86768", 0.00000514 → "0.00000514".
 * Below ~1e-6 the result is exponential ("5.14e-7"); `parseFloat` and
 * `<input type="number">` both accept that.
 */
export function priceInputValue(price: number): string {
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

const axisTickFormatter = new Intl.NumberFormat(DISPLAY_LOCALE, {
  notation: "compact",
  maximumSignificantDigits: 4,
});

/**
 * A number for a chart axis tick: compact, at most four significant digits, and
 * no currency symbol — the gutter has no room for one, and the chart's stats row
 * and tooltip both name the currency.
 *
 * A price axis has to span the whole range an asset can trade at, and significant
 * digits are what cover both ends: 89000 → "89.000", 1e-7 → "0,0000001".
 * `formatCurrencyCompact` caps at one fraction digit, so it renders every tick
 * under 0.05 as "0 €". Use that one for axes whose values are amounts of money
 * (a position's value), and this one for axes of unit prices.
 */
export function formatAxisTick(value: number): string {
  return axisTickFormatter.format(value);
}

const unitPriceFormatterCache = new Map<string, Intl.NumberFormat>();

/**
 * A unit price for display — see the note above. Carries `priceInputValue`'s
 * precision rule with `formatCurrency`'s presentation; `formatCurrency` alone
 * cannot, because the currency's fixed scale rounds a 0,00000514 € coin to
 * 0,00 €.
 *
 * e.g. 89000 → "89.000,00 €", 12.94 → "12,94 €", 0.00000514 → "0,00000514 €"
 */
export function formatUnitPrice(price: number, currency: string = getBaseCurrency()): string {
  const tiny = price !== 0 && Math.abs(price) < 0.01;
  // Fraction digits are capped: `countDecimals` reads a float's decimal
  // expansion, which can run to 17 digits, and Intl rejects more than 20.
  const digits = tiny ? 3 : Math.min(8, Math.max(2, countDecimals(price)));
  const key = `${currency}:${tiny ? "s" : "f"}${digits}`;

  let formatter = unitPriceFormatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(DISPLAY_LOCALE, {
      style: "currency",
      currency,
      ...(tiny
        ? { maximumSignificantDigits: digits }
        : { minimumFractionDigits: 2, maximumFractionDigits: digits }),
    });
    unitPriceFormatterCache.set(key, formatter);
  }
  return formatter.format(price);
}

const quantityFormatter = new Intl.NumberFormat(DISPLAY_LOCALE, { maximumFractionDigits: 8 });

const quantityCompactFormatter = new Intl.NumberFormat(DISPLAY_LOCALE, {
  notation: "compact",
  maximumFractionDigits: 3,
});

/** Above this, a holding's exact digits stop being worth the width. */
const QUANTITY_COMPACT_FROM = 1_000_000;

/**
 * A holdings count: grouped, and abbreviated once it passes a million
 * ("2.695", "0,01305", "1,235 Mio.", "5 Mrd.").
 *
 * Eight decimals matches the precision holdings are stored at
 * (`AssetService` rounds them with `toFixed(8)`), so this never invents or
 * hides a digit below the abbreviation threshold.
 *
 * Abbreviating only above a million is deliberate. Compact notation rounds to a
 * few significant digits, and in a locale where "." groups thousands the result
 * is ambiguous: 12345 compacts to "12.350", which reads as a *precise* 12,350.
 * Past a million the suffix ("Mio.", "Mrd.") makes the approximation explicit.
 */
export function formatQuantity(value: number): string {
  return Math.abs(value) >= QUANTITY_COMPACT_FROM
    ? quantityCompactFormatter.format(value)
    : quantityFormatter.format(value);
}

/**
 * Unit label for an asset's holdings.
 *
 * A deposit's quantity *is* an amount of money, so it reads in the account's
 * currency. Everything else is a count of shares, coins, or items — labelling
 * those with a currency claims the position is cash, which is wrong by orders
 * of magnitude for anything whose unit price isn't 1.
 */
export function holdingsUnit(asset: { type: string; currency: string; name: string }): string {
  return asset.type === "deposit" ? asset.currency : asset.name;
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
