export const dynamic = "force-dynamic";

import { HydrationBoundary } from "@tanstack/react-query";
import { requireOnboarding } from "@/lib/api/require-timezone";
import { getPortfolioReportService } from "@/lib/api/services";
import { PortfolioReportsClient } from "@/components/portfolio/portfolio-reports-client";
import {
  DEFAULT_PORTFOLIO_WINDOW,
  portfolioReportParams,
} from "@/components/portfolio/portfolio-report-query";
import { seedQueries } from "@/lib/queries/seed";
import {
  allocationQuery,
  assetPerformanceQuery,
  currencyExposureQuery,
  netWorthQuery,
  realizedPnlQuery,
} from "@/lib/queries/portfolio";
import {
  AssetPerformanceQuerySchema,
  NetWorthQuerySchema,
  RealizedPnlQuerySchema,
} from "@/lib/validators/portfolio-reports";

export default function PortfolioReportsPage(): React.ReactElement {
  requireOnboarding();
  const reports = getPortfolioReportService();
  const params = portfolioReportParams(DEFAULT_PORTFOLIO_WINDOW);

  const state = seedQueries((client) => {
    const netWorth = NetWorthQuerySchema.parse(params.netWorth);
    client.setQueryData(
      netWorthQuery(params.netWorth).queryKey,
      reports.getNetWorthTimeSeries(netWorth.window, netWorth.interval)
    );
    const performance = AssetPerformanceQuerySchema.parse(params.performance);
    client.setQueryData(
      assetPerformanceQuery(params.performance).queryKey,
      reports.getAssetPerformance(performance.from, performance.to)
    );
    client.setQueryData(allocationQuery().queryKey, reports.getAllocation());
    client.setQueryData(currencyExposureQuery().queryKey, reports.getCurrencyExposure());
    const realizedPnl = RealizedPnlQuerySchema.parse(params.realizedPnl);
    client.setQueryData(
      realizedPnlQuery(params.realizedPnl).queryKey,
      reports.getRealizedPnL(realizedPnl.from, realizedPnl.to)
    );
  });

  return (
    <HydrationBoundary state={state}>
      <PortfolioReportsClient />
    </HydrationBoundary>
  );
}
