import {
  DEFAULT_PRESET,
  computeCompareRange,
  computePresetRange,
  type ComputedRange,
} from "@/lib/date-ranges";
import type {
  CategoryTrendsParams,
  NetIncomeParams,
  SpendingSummaryParams,
  TopMerchantsParams,
  TrendsParams,
} from "@/lib/queries/reports";

// Shared by the cash-flow page's server component (which seeds the report for
// the range it opens on) and its client component (which fetches every other
// range), so both derive the same queries — and so the same cache keys — from
// a range.

/** The range the report opens on. */
export function initialCashFlowRange(): ComputedRange {
  return computeCompareRange(computePresetRange(DEFAULT_PRESET));
}

/**
 * Whether a range is drawn as monthly trends. A shorter range has too few
 * months to chart, so it is compared with the period before it instead.
 */
export function showsTrends(range: ComputedRange): boolean {
  return range.months >= 3;
}

/** The request behind each section of the report. */
export interface CashFlowParams {
  netIncome: NetIncomeParams;
  incomeTrend: TrendsParams;
  expenseTrend: TrendsParams;
  categoryTrends: CategoryTrendsParams;
  spendingSummary: SpendingSummaryParams;
  topMerchants: TopMerchantsParams;
}

export function cashFlowParams(range: ComputedRange): CashFlowParams {
  const { dateFrom, dateTo } = range;
  return {
    netIncome: { dateFrom, dateTo },
    incomeTrend: { dateFrom, dateTo, type: "income" },
    expenseTrend: { dateFrom, dateTo, type: "expense" },
    categoryTrends: { dateFrom, dateTo, type: "expense" },
    spendingSummary: {
      dateFrom,
      dateTo,
      groupBy: "category",
      type: "expense",
      compareDateFrom: range.compareDateFrom,
      compareDateTo: range.compareDateTo,
    },
    topMerchants: { dateFrom, dateTo, type: "expense" },
  };
}
