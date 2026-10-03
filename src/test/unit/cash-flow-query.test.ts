// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { z } from "zod";
import {
  cashFlowParams,
  initialCashFlowRange,
  showsTrends,
} from "@/components/reports/cash-flow-query";
import { searchParamsToObject, toSearchParams } from "@/lib/api/search-params";
import { computeCompareRange, setUserTimezone } from "@/lib/date-ranges";
import {
  CategoryTrendsSchema,
  NetIncomeSchema,
  SpendingSummarySchema,
  TopMerchantsSchema,
  TrendsSchema,
} from "@/lib/validators/reports";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(Date.UTC(2026, 2, 19))); // March 19, 2026 UTC
  setUserTimezone("UTC");
});

afterEach(() => {
  vi.useRealTimers();
});

const H1 = computeCompareRange({ dateFrom: "2026-01-01", dateTo: "2026-06-30" });
const ONE_MONTH = computeCompareRange({ dateFrom: "2026-03-01", dateTo: "2026-03-31" });

describe("initialCashFlowRange", () => {
  it("opens on the last six months, this one included, against the six before", () => {
    expect(initialCashFlowRange()).toEqual({
      dateFrom: "2025-10-01",
      dateTo: "2026-03-31",
      compareDateFrom: "2025-04-01",
      compareDateTo: "2025-09-30",
      months: 6,
    });
  });

  it("reads this month in the configured timezone", () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 2, 31, 22, 30))); // already April 1 in Sofia
    setUserTimezone("Europe/Sofia");

    expect(initialCashFlowRange()).toMatchObject({ dateFrom: "2025-11-01", dateTo: "2026-04-30" });
  });
});

describe("showsTrends", () => {
  it("charts trends from three months up", () => {
    expect(showsTrends(computeCompareRange({ dateFrom: "2026-01-01", dateTo: "2026-03-31" }))).toBe(
      true
    );
    expect(showsTrends(H1)).toBe(true);
  });

  it("compares a month or two with the period before instead", () => {
    expect(showsTrends(ONE_MONTH)).toBe(false);
    expect(showsTrends(computeCompareRange({ dateFrom: "2026-02-01", dateTo: "2026-03-31" }))).toBe(
      false
    );
  });
});

describe("cashFlowParams", () => {
  it("asks every section for the range's own dates, trends included", () => {
    expect(cashFlowParams(H1)).toEqual({
      netIncome: { dateFrom: "2026-01-01", dateTo: "2026-06-30" },
      incomeTrend: { dateFrom: "2026-01-01", dateTo: "2026-06-30", type: "income" },
      expenseTrend: { dateFrom: "2026-01-01", dateTo: "2026-06-30", type: "expense" },
      categoryTrends: { dateFrom: "2026-01-01", dateTo: "2026-06-30", type: "expense" },
      spendingSummary: {
        dateFrom: "2026-01-01",
        dateTo: "2026-06-30",
        groupBy: "category",
        type: "expense",
        compareDateFrom: "2025-07-01",
        compareDateTo: "2025-12-31",
      },
      topMerchants: { dateFrom: "2026-01-01", dateTo: "2026-06-30", type: "expense" },
    });
  });

  // The server seeds each section with `Schema.parse(params)`; the route
  // answers the client with the schema applied to the decoded query string.
  // The two match only if the params survive the trip unchanged.
  it.each([
    { label: "a half year", range: H1 },
    { label: "a single month", range: ONE_MONTH },
  ])("reaches each route over $label exactly as the server seeds it", ({ range }) => {
    const params = cashFlowParams(range);
    const sections: Array<[z.ZodType, (typeof params)[keyof typeof params]]> = [
      [NetIncomeSchema, params.netIncome],
      [TrendsSchema, params.incomeTrend],
      [TrendsSchema, params.expenseTrend],
      [CategoryTrendsSchema, params.categoryTrends],
      [SpendingSummarySchema, params.spendingSummary],
      [TopMerchantsSchema, params.topMerchants],
    ];

    for (const [schema, sectionParams] of sections) {
      const wire = searchParamsToObject(toSearchParams(sectionParams), schema);
      expect(schema.parse(wire)).toEqual(schema.parse(sectionParams));
    }
  });
});
