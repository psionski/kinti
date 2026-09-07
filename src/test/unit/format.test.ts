// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  clearBaseCurrencyCache,
  formatAxisTick,
  formatCurrency,
  formatDate,
  formatFrequency,
  formatMonth,
  formatPercent,
  formatQuantity,
  formatUnitPrice,
  holdingsUnit,
  priceInputValue,
  roundToCurrency,
  setBaseCurrencyCache,
} from "@/lib/format";

// ─── formatCurrency ──────────────────────────────────────────────────────────

describe("formatCurrency", () => {
  beforeEach(() => setBaseCurrencyCache("EUR"));
  afterEach(() => clearBaseCurrencyCache());

  it("formats EUR amounts (default base)", () => {
    const result = formatCurrency(123.45);
    // de-DE EUR locale: "123,45 €" (may include non-breaking space)
    expect(result).toContain("123,45");
    expect(result).toContain("€");
  });

  it("formats zero", () => {
    const result = formatCurrency(0);
    expect(result).toContain("0,00");
    expect(result).toContain("€");
  });

  it("formats negative amounts", () => {
    const result = formatCurrency(-50);
    expect(result).toContain("50,00");
    expect(result).toContain("€");
  });

  it("formats large amounts with thousands separator", () => {
    const result = formatCurrency(12345.67);
    expect(result).toContain("12.345,67");
  });

  it("formats USD with explicit currency", () => {
    const result = formatCurrency(99.5, "USD");
    expect(result).toContain("99,50");
    expect(result).toContain("$");
  });

  it("formats JPY with zero decimal places (Intl-driven precision)", () => {
    const result = formatCurrency(1234.56, "JPY");
    // JPY has zero fraction digits — Intl rounds the input
    expect(result).toContain("1.235");
    expect(result).not.toContain(",56");
  });

  it("formats BHD with three decimal places", () => {
    const result = formatCurrency(1.2345, "BHD");
    expect(result).toContain("1,235");
  });

  it("respects the cached base currency when no currency is passed", () => {
    setBaseCurrencyCache("USD");
    const result = formatCurrency(50);
    expect(result).toContain("$");
    expect(result).not.toContain("€");
  });
});

// ─── roundToCurrency ─────────────────────────────────────────────────────────

describe("roundToCurrency", () => {
  it("rounds to 2 decimals for EUR/USD", () => {
    expect(roundToCurrency(1.234, "EUR")).toBe(1.23);
    expect(roundToCurrency(1.235, "USD")).toBe(1.24);
  });

  it("rounds to 0 decimals for JPY", () => {
    expect(roundToCurrency(1234.56, "JPY")).toBe(1235);
  });

  it("rounds to 3 decimals for BHD", () => {
    expect(roundToCurrency(1.2345, "BHD")).toBe(1.235);
  });
});

// ─── formatPercent ───────────────────────────────────────────────────────────

describe("priceInputValue", () => {
  // The parseable form: it is written into number inputs, so no symbol, no
  // grouping, and always `.` as the decimal separator.
  it("keeps at least two decimals", () => {
    expect(priceInputValue(345.6)).toBe("345.60");
    expect(priceInputValue(12)).toBe("12.00");
  });

  it("keeps the extra precision a price actually has", () => {
    expect(priceInputValue(0.86768)).toBe("0.86768");
  });

  it("switches to significant digits below a cent", () => {
    expect(priceInputValue(0.00000514)).toBe("0.00000514");
  });

  it("stays parseable for large values", () => {
    const s = priceInputValue(89000);
    expect(s).toBe("89000.00");
    expect(parseFloat(s)).toBe(89000);
  });

  it("formats zero", () => {
    expect(priceInputValue(0)).toBe("0.00");
  });
});

describe("formatUnitPrice", () => {
  // Intl separates the amount and symbol with a non-breaking space, so these
  // assert on the parts rather than an exact string.
  it("uses the display locale and the currency symbol", () => {
    expect(formatUnitPrice(89000, "EUR")).toContain("89.000,00");
    expect(formatUnitPrice(89000, "EUR")).toContain("€");
    expect(formatUnitPrice(12.94, "EUR")).toContain("12,94");
  });

  it("keeps sub-cent precision that the currency's own scale would round away", () => {
    // formatCurrency would render this 0,00 € — the whole reason this exists.
    expect(formatUnitPrice(0.00000514, "EUR")).toContain("0,00000514");
  });

  it("keeps the extra precision a price actually has", () => {
    expect(formatUnitPrice(0.86768, "EUR")).toContain("0,86768");
  });

  it("respects the cached base currency when none is passed", () => {
    setBaseCurrencyCache("USD");
    expect(formatUnitPrice(12.5)).toContain("$");
  });
});

describe("formatAxisTick", () => {
  // A price axis has to span whatever the asset trades at, so both ends matter.
  it("abbreviates large prices with a one-character suffix", () => {
    expect(formatAxisTick(89000)).toBe("89K");
    expect(formatAxisTick(1250000)).toBe("1,25M");
    expect(formatAxisTick(2500000000)).toBe("2,5B");
  });

  // The locale's own compact forms are wider than the digits they replace,
  // which is the opposite of what an axis gutter needs.
  it("uses K/M rather than the display locale's compact words", () => {
    expect(formatAxisTick(89000)).not.toContain("Tsd");
    expect(formatAxisTick(1000000)).not.toContain("Mio");
  });

  it("keeps sub-cent prices legible instead of collapsing them to zero", () => {
    expect(formatAxisTick(0.0000001)).toBe("1e-7");
    expect(formatAxisTick(0.00000514)).toBe("5,14e-6");
  });

  it("keeps ordinary prices exact", () => {
    expect(formatAxisTick(0)).toBe("0");
    expect(formatAxisTick(12.94)).toBe("12,94");
    expect(formatAxisTick(715.3)).toBe("715,3");
    expect(formatAxisTick(0.00099)).toBe("0,00099");
  });

  it("carries no currency symbol", () => {
    expect(formatAxisTick(12.94)).not.toContain("€");
  });

  it("keeps every tick short enough for a narrow gutter", () => {
    for (const v of [0, 0.0000001, 0.00099, 12.94, 715.3, 89000, 1250000, 2.5e9]) {
      expect(formatAxisTick(v).length).toBeLessThanOrEqual(7);
    }
  });
});

describe("formatQuantity", () => {
  it("groups thousands", () => {
    expect(formatQuantity(2695)).toBe("2.695");
    expect(formatQuantity(89000)).toBe("89.000");
  });

  it("keeps a holding exact right up to the abbreviation threshold", () => {
    // Compact notation would round this to "12.350", which in a "."-grouping
    // locale reads as a precise 12,350 — a different number of units.
    expect(formatQuantity(12345)).toBe("12.345");
    expect(formatQuantity(999999)).toBe("999.999");
  });

  it("abbreviates past a million, where the suffix makes rounding explicit", () => {
    expect(formatQuantity(1234567)).toContain("Mio");
    expect(formatQuantity(5000000000)).toContain("Mrd");
  });

  it("keeps fractional holdings to the precision they are stored at", () => {
    expect(formatQuantity(0.01305)).toBe("0,01305");
    expect(formatQuantity(0.00000001)).toBe("0,00000001");
  });
});

describe("formatPercent", () => {
  it("formats with 1 decimal place", () => {
    expect(formatPercent(75.5)).toBe("75.5%");
  });

  it("formats zero", () => {
    expect(formatPercent(0)).toBe("0.0%");
  });

  it("formats 100", () => {
    expect(formatPercent(100)).toBe("100.0%");
  });

  it("rounds to 1 decimal", () => {
    expect(formatPercent(33.333)).toBe("33.3%");
  });

  it("formats values over 100", () => {
    expect(formatPercent(125.7)).toBe("125.7%");
  });
});

// ─── formatMonth ─────────────────────────────────────────────────────────────

describe("formatMonth", () => {
  it("formats YYYY-MM to short month + year", () => {
    expect(formatMonth("2026-03")).toBe("Mar 2026");
  });

  it("formats January", () => {
    expect(formatMonth("2026-01")).toBe("Jan 2026");
  });

  it("formats December", () => {
    expect(formatMonth("2025-12")).toBe("Dec 2025");
  });
});

// ─── formatDate ──────────────────────────────────────────────────────────────

describe("formatDate", () => {
  it("formats YYYY-MM-DD to short date", () => {
    expect(formatDate("2026-03-18")).toBe("Mar 18");
  });

  it("formats single-digit day", () => {
    expect(formatDate("2026-01-05")).toBe("Jan 5");
  });

  it("formats last day of month", () => {
    expect(formatDate("2026-02-28")).toBe("Feb 28");
  });
});

// ─── formatFrequency ─────────────────────────────────────────────────────────

describe("formatFrequency", () => {
  it("returns 'Daily' for daily frequency", () => {
    expect(
      formatFrequency({
        frequency: "daily",
        dayOfMonth: null,
        dayOfWeek: null,
        startDate: "2026-03-01",
      })
    ).toBe("Daily");
  });

  it("returns 'Weekly on {day}' using dayOfWeek", () => {
    expect(
      formatFrequency({
        frequency: "weekly",
        dayOfMonth: null,
        dayOfWeek: 1, // Monday
        startDate: "2026-03-01",
      })
    ).toBe("Weekly on Monday");
  });

  it("falls back to startDate day-of-week when dayOfWeek is null", () => {
    // 2026-03-01 is a Sunday
    expect(
      formatFrequency({
        frequency: "weekly",
        dayOfMonth: null,
        dayOfWeek: null,
        startDate: "2026-03-01",
      })
    ).toBe("Weekly on Sunday");
  });

  it("returns 'Monthly on the {ordinal}' using dayOfMonth", () => {
    expect(
      formatFrequency({
        frequency: "monthly",
        dayOfMonth: 15,
        dayOfWeek: null,
        startDate: "2026-03-01",
      })
    ).toBe("Monthly on the 15th");
  });

  it("falls back to startDate day for monthly when dayOfMonth is null", () => {
    expect(
      formatFrequency({
        frequency: "monthly",
        dayOfMonth: null,
        dayOfWeek: null,
        startDate: "2026-03-21",
      })
    ).toBe("Monthly on the 21st");
  });

  it("formats ordinals correctly (1st, 2nd, 3rd)", () => {
    const base = { frequency: "monthly", dayOfWeek: null, startDate: "2026-03-01" };
    expect(formatFrequency({ ...base, dayOfMonth: 1 })).toBe("Monthly on the 1st");
    expect(formatFrequency({ ...base, dayOfMonth: 2 })).toBe("Monthly on the 2nd");
    expect(formatFrequency({ ...base, dayOfMonth: 3 })).toBe("Monthly on the 3rd");
    expect(formatFrequency({ ...base, dayOfMonth: 4 })).toBe("Monthly on the 4th");
  });

  it("formats teen ordinals as th (11th, 12th, 13th)", () => {
    const base = { frequency: "monthly", dayOfWeek: null, startDate: "2026-03-01" };
    expect(formatFrequency({ ...base, dayOfMonth: 11 })).toBe("Monthly on the 11th");
    expect(formatFrequency({ ...base, dayOfMonth: 12 })).toBe("Monthly on the 12th");
    expect(formatFrequency({ ...base, dayOfMonth: 13 })).toBe("Monthly on the 13th");
  });

  it("returns 'Yearly on {date}' for yearly frequency", () => {
    expect(
      formatFrequency({
        frequency: "yearly",
        dayOfMonth: null,
        dayOfWeek: null,
        startDate: "2026-07-04",
      })
    ).toBe("Yearly on Jul 4");
  });

  it("returns raw frequency string for unknown frequency", () => {
    expect(
      formatFrequency({
        frequency: "biweekly",
        dayOfMonth: null,
        dayOfWeek: null,
        startDate: "2026-03-01",
      })
    ).toBe("biweekly");
  });
});

// ─── holdingsUnit ────────────────────────────────────────────────────────────

describe("holdingsUnit", () => {
  it("labels a deposit's balance in its currency", () => {
    expect(holdingsUnit({ type: "deposit", currency: "EUR", name: "Savings" })).toBe("EUR");
  });

  it("labels a foreign deposit in that account's currency, not the base", () => {
    expect(holdingsUnit({ type: "deposit", currency: "USD", name: "US Account" })).toBe("USD");
  });

  it("labels shares by the holding, never by a currency", () => {
    // "2695 EUR" for an ETF position reads as cash and is wrong by a factor of
    // the unit price.
    expect(
      holdingsUnit({ type: "investment", currency: "EUR", name: "Amundi Prime World (WEBN)" })
    ).toBe("Amundi Prime World (WEBN)");
  });

  it("labels crypto and other assets by the holding too", () => {
    expect(holdingsUnit({ type: "crypto", currency: "EUR", name: "Bitcoin" })).toBe("Bitcoin");
    expect(holdingsUnit({ type: "other", currency: "EUR", name: "Car" })).toBe("Car");
  });
});
