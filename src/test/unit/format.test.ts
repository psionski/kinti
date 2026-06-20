// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  formatCurrency,
  formatPercent,
  formatMonth,
  formatDate,
  formatFrequency,
  roundToCurrency,
  setBaseCurrencyCache,
  clearBaseCurrencyCache,
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
