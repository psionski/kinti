import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";
import { apiGet } from "@/lib/api-client";
import type { PortfolioResponse } from "@/lib/validators/assets";
import type {
  AllocationResult,
  AssetPerformanceItem,
  AssetPerformanceQuerySchema,
  CurrencyExposureItem,
  NetWorthPoint,
  NetWorthQuerySchema,
  RealizedPnlQuerySchema,
  RealizedPnlResult,
} from "@/lib/validators/portfolio-reports";

/** Query parameters of `GET /api/portfolio/net-worth`, as a caller sends them. */
export type NetWorthParams = z.input<typeof NetWorthQuerySchema>;
/** Query parameters of `GET /api/portfolio/performance`. */
export type AssetPerformanceParams = z.input<typeof AssetPerformanceQuerySchema>;
/** Query parameters of `GET /api/portfolio/realized-pnl`. */
export type RealizedPnlParams = z.input<typeof RealizedPnlQuerySchema>;

export const portfolioKeys = {
  all: ["portfolio"] as const,
  summary: () => [...portfolioKeys.all, "summary"] as const,
  netWorth: (params: NetWorthParams) => [...portfolioKeys.all, "net-worth", params] as const,
  performance: (params: AssetPerformanceParams) =>
    [...portfolioKeys.all, "performance", params] as const,
  allocation: () => [...portfolioKeys.all, "allocation"] as const,
  currencyExposure: () => [...portfolioKeys.all, "currency-exposure"] as const,
  realizedPnl: (params: RealizedPnlParams) =>
    [...portfolioKeys.all, "realized-pnl", params] as const,
};

/** Every asset with its metrics, cash balance, net worth and total P&L — `GET /api/portfolio`. */
export function portfolioQuery() {
  return queryOptions({
    queryKey: portfolioKeys.summary(),
    queryFn: ({ signal }) => apiGet<PortfolioResponse>("/api/portfolio", {}, { signal }),
  });
}

/** Cash and asset value over a time window, one point per interval. */
export function netWorthQuery(params: NetWorthParams) {
  return queryOptions({
    queryKey: portfolioKeys.netWorth(params),
    queryFn: ({ signal }) =>
      apiGet<NetWorthPoint[]>("/api/portfolio/net-worth", params, { signal }),
  });
}

/** Cost basis, value and P&L of every held asset. */
export function assetPerformanceQuery(params: AssetPerformanceParams) {
  return queryOptions({
    queryKey: portfolioKeys.performance(params),
    queryFn: ({ signal }) =>
      apiGet<AssetPerformanceItem[]>("/api/portfolio/performance", params, { signal }),
  });
}

/** Current value split by asset and by asset type. */
export function allocationQuery() {
  return queryOptions({
    queryKey: portfolioKeys.allocation(),
    queryFn: ({ signal }) => apiGet<AllocationResult>("/api/portfolio/allocation", {}, { signal }),
  });
}

/** Current value split by the assets' native currencies. */
export function currencyExposureQuery() {
  return queryOptions({
    queryKey: portfolioKeys.currencyExposure(),
    queryFn: ({ signal }) =>
      apiGet<CurrencyExposureItem[]>("/api/portfolio/currency-exposure", {}, { signal }),
  });
}

/** P&L locked in by sales, per asset and in total. */
export function realizedPnlQuery(params: RealizedPnlParams) {
  return queryOptions({
    queryKey: portfolioKeys.realizedPnl(params),
    queryFn: ({ signal }) =>
      apiGet<RealizedPnlResult>("/api/portfolio/realized-pnl", params, { signal }),
  });
}
