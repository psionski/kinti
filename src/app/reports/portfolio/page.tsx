export const dynamic = "force-dynamic";

import { requireOnboarding } from "@/lib/api/require-timezone";
import { getPortfolioService, getPortfolioReportService } from "@/lib/api/services";
import {
  PortfolioReportsClient,
  type PortfolioReportsData,
} from "@/components/portfolio/portfolio-reports-client";

const DEFAULT_WINDOW = "6m" as const;

export default function PortfolioReportsPage(): React.ReactElement {
  requireOnboarding();
  const reportService = getPortfolioReportService();
  const portfolio = getPortfolioService().getPortfolio();
  const netWorth = reportService.getNetWorthTimeSeries(DEFAULT_WINDOW, "monthly");
  const performance = reportService.getAssetPerformance();
  const allocation = reportService.getAllocation();
  const currencyExposure = reportService.getCurrencyExposure();
  const realizedPnl = reportService.getRealizedPnL();

  const initialData: PortfolioReportsData = {
    netWorth,
    performance,
    allocation,
    currencyExposure,
    realizedPnl,
    unrealizedPnl: portfolio.pnl,
  };

  return <PortfolioReportsClient initialData={initialData} initialWindow={DEFAULT_WINDOW} />;
}
