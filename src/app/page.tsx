export const dynamic = "force-dynamic";

import { requireOnboarding } from "@/lib/api/require-timezone";
import {
  getReportService,
  getBudgetService,
  getCategoryService,
  getRecurringService,
  getPortfolioService,
  getPortfolioReportService,
} from "@/lib/api/services";
import { getCurrentMonthInfo, getPreviousMonthRange, isoToday } from "@/lib/date-ranges";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { SpendingTrendChart } from "@/components/charts/spending-trend-chart";
import { CategoryDonutChart } from "@/components/charts/category-donut-chart";
import { BudgetAlerts } from "@/components/dashboard/budget-alerts";
import { SpendingHeatmap } from "@/components/dashboard/spending-heatmap";
import { UpcomingRecurring } from "@/components/dashboard/upcoming-recurring";
import { NetWorthCard } from "@/components/dashboard/net-worth-card";
import { NetWorthSparkline } from "@/components/dashboard/net-worth-sparkline";
import { TopMovers } from "@/components/dashboard/top-movers";
import { AllocationMiniDonut } from "@/components/dashboard/allocation-mini-donut";
import type { CategoryWithCountResponse } from "@/lib/validators/categories";

export default function DashboardPage(): React.ReactElement {
  requireOnboarding();
  const reportService = getReportService();
  const budgetService = getBudgetService();
  const categoryService = getCategoryService();

  const { monthStart, monthEnd, currentMonth, monthLabel } = getCurrentMonthInfo();
  const { prevMonthStart, prevMonthEnd } = getPreviousMonthRange(currentMonth);

  const summary = reportService.spendingSummary({
    dateFrom: monthStart,
    dateTo: monthEnd,
    groupBy: "category",
    type: "expense",
    compareDateFrom: prevMonthStart,
    compareDateTo: prevMonthEnd,
    includeTransfers: false,
  });

  const breakdown = reportService.getCategoryStats({
    dateFrom: monthStart,
    dateTo: monthEnd,
    type: "expense",
    includeZeroSpend: false,
    includeUncategorized: true,
  });

  const trends = reportService.trends({ months: 6, type: "expense" });

  const { items: budgetStatus } = budgetService.getForMonth({ month: currentMonth });

  const heatmap = reportService.dailySpend({ days: 365 });

  const allCategories = categoryService.getAll();
  const categoryMap = new Map<number, CategoryWithCountResponse>(
    allCategories.map((c) => [c.id, c])
  );

  const portfolio = getPortfolioService().getPortfolio();
  const portfolioReportService = getPortfolioReportService();
  const netWorthTimeSeries = portfolioReportService.getNetWorthTimeSeries("6m", "monthly");
  const allocation = portfolioReportService.getAllocation();

  const allRecurring = getRecurringService().list();
  const upcomingRecurring = allRecurring
    .filter((r) => r.isActive === 1 && r.nextOccurrence !== null)
    .sort((a, b) => a.nextOccurrence!.localeCompare(b.nextOccurrence!))
    .slice(0, 5);

  const allocationData = allocation.byAsset.map((a) => ({
    name: a.name,
    value: a.currentValue,
    pct: a.pct,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>

      {/* At a Glance — universal KPIs */}
      <KpiCards summary={summary} budgetStatus={budgetStatus} categories={categoryMap} />

      <section data-tour="spending-section">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SpendingTrendChart data={trends.points} />
          <CategoryDonutChart data={breakdown.items} monthLabel={monthLabel} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BudgetAlerts budgetStatus={budgetStatus} />
        <UpcomingRecurring items={upcomingRecurring} />
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <NetWorthCard portfolio={portfolio} />
          <NetWorthSparkline data={netWorthTimeSeries} />
        </div>
        <TopMovers assets={portfolio.assets} />
        <AllocationMiniDonut data={allocationData} />
      </div>

      <SpendingHeatmap points={heatmap.points} today={isoToday()} />
    </div>
  );
}
