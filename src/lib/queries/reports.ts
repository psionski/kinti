import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";
import { apiGet } from "@/lib/api-client";
import type {
  CategoryTrendsResult,
  CategoryTrendsSchema,
  NetIncomeResult,
  NetIncomeSchema,
  SpendingSummaryResult,
  SpendingSummarySchema,
  TopMerchantsResult,
  TopMerchantsSchema,
  TrendsResult,
  TrendsSchema,
} from "@/lib/validators/reports";

/** Query parameters of `GET /api/reports/income`, as a caller sends them. */
export type NetIncomeParams = z.input<typeof NetIncomeSchema>;
/** Query parameters of `GET /api/reports/trends`. */
export type TrendsParams = z.input<typeof TrendsSchema>;
/** Query parameters of `GET /api/reports/category-trends`. */
export type CategoryTrendsParams = z.input<typeof CategoryTrendsSchema>;
/** Query parameters of `GET /api/reports/summary`. */
export type SpendingSummaryParams = z.input<typeof SpendingSummarySchema>;
/** Query parameters of `GET /api/reports/top-merchants`. */
export type TopMerchantsParams = z.input<typeof TopMerchantsSchema>;

export const reportKeys = {
  all: ["reports"] as const,
  netIncome: (params: NetIncomeParams) => [...reportKeys.all, "income", params] as const,
  trends: (params: TrendsParams) => [...reportKeys.all, "trends", params] as const,
  categoryTrends: (params: CategoryTrendsParams) =>
    [...reportKeys.all, "category-trends", params] as const,
  spendingSummary: (params: SpendingSummaryParams) =>
    [...reportKeys.all, "summary", params] as const,
  topMerchants: (params: TopMerchantsParams) =>
    [...reportKeys.all, "top-merchants", params] as const,
};

/** Income, expenses and their difference over a period. */
export function netIncomeQuery(params: NetIncomeParams) {
  return queryOptions({
    queryKey: reportKeys.netIncome(params),
    queryFn: ({ signal }) => apiGet<NetIncomeResult>("/api/reports/income", params, { signal }),
  });
}

/** Monthly totals for the last `months` months, ending with the current one. */
export function trendsQuery(params: TrendsParams) {
  return queryOptions({
    queryKey: reportKeys.trends(params),
    queryFn: ({ signal }) => apiGet<TrendsResult>("/api/reports/trends", params, { signal }),
  });
}

/** Monthly totals per top-level category over a period. */
export function categoryTrendsQuery(params: CategoryTrendsParams) {
  return queryOptions({
    queryKey: reportKeys.categoryTrends(params),
    queryFn: ({ signal }) =>
      apiGet<CategoryTrendsResult>("/api/reports/category-trends", params, { signal }),
  });
}

/** Totals grouped by category, month or merchant, optionally against a comparison period. */
export function spendingSummaryQuery(params: SpendingSummaryParams) {
  return queryOptions({
    queryKey: reportKeys.spendingSummary(params),
    queryFn: ({ signal }) =>
      apiGet<SpendingSummaryResult>("/api/reports/summary", params, { signal }),
  });
}

export function topMerchantsQuery(params: TopMerchantsParams) {
  return queryOptions({
    queryKey: reportKeys.topMerchants(params),
    queryFn: ({ signal }) =>
      apiGet<TopMerchantsResult>("/api/reports/top-merchants", params, { signal }),
  });
}
