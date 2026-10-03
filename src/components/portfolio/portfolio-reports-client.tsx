"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ReportSection } from "@/components/reports/report-section";
import { NetWorthChart } from "./net-worth-chart";
import { AllocationChart } from "./allocation-chart";
import { PerformanceTable } from "./performance-table";
import { CurrencyExposure } from "./currency-exposure";
import { PnlSummary } from "./pnl-summary";
import {
  DEFAULT_PORTFOLIO_WINDOW,
  PORTFOLIO_WINDOWS,
  portfolioReportParams,
  unrealizedPnl,
} from "./portfolio-report-query";
import {
  allocationQuery,
  assetPerformanceQuery,
  currencyExposureQuery,
  netWorthQuery,
  realizedPnlQuery,
} from "@/lib/queries/portfolio";
import type { Window } from "@/lib/validators/portfolio-reports";

export function PortfolioReportsClient(): React.ReactElement {
  const [window, setWindow] = useState<Window>(DEFAULT_PORTFOLIO_WINDOW);
  const params = portfolioReportParams(window);

  // Only the net-worth chart follows the window. While a new window loads it
  // keeps the previous one's line on screen, dimmed.
  const netWorth = useQuery({
    ...netWorthQuery(params.netWorth),
    placeholderData: keepPreviousData,
  });
  const performance = useQuery(assetPerformanceQuery(params.performance));
  const allocation = useQuery(allocationQuery());
  const currencyExposure = useQuery(currencyExposureQuery());
  const realizedPnl = useQuery(realizedPnlQuery(params.realizedPnl));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Portfolio Report</h1>
      </div>

      <div className="flex flex-wrap gap-2">
        {PORTFOLIO_WINDOWS.map((w) => (
          <Button
            key={w}
            variant={window === w ? "default" : "outline"}
            size="sm"
            onClick={() => setWindow(w)}
          >
            {w.toUpperCase()}
          </Button>
        ))}
      </div>

      <ReportSection title="Net Worth Over Time" queries={[netWorth]}>
        {(data) => <NetWorthChart data={data} />}
      </ReportSection>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ReportSection title="Allocation" queries={[allocation]}>
          {(data) => <AllocationChart data={data} />}
        </ReportSection>
        <ReportSection title="Currency Exposure" queries={[currencyExposure]}>
          {(data) => <CurrencyExposure data={data} />}
        </ReportSection>
      </div>

      <ReportSection title="Performance" queries={[performance]}>
        {(data) => <PerformanceTable data={data} />}
      </ReportSection>

      <ReportSection title="Profit & Loss" queries={[realizedPnl, performance]}>
        {(realized, performanceData) => (
          <PnlSummary realizedPnl={realized} unrealizedPnl={unrealizedPnl(performanceData)} />
        )}
      </ReportSection>
    </div>
  );
}
