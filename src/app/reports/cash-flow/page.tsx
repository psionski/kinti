export const dynamic = "force-dynamic";

import { HydrationBoundary } from "@tanstack/react-query";
import { requireOnboarding } from "@/lib/api/require-timezone";
import { getReportService, getCategoryService } from "@/lib/api/services";
import { ReportsClient } from "@/components/reports/reports-client";
import {
  cashFlowParams,
  initialCashFlowRange,
  showsTrends,
} from "@/components/reports/cash-flow-query";
import { seedQueries } from "@/lib/queries/seed";
import {
  categoryTrendsQuery,
  netIncomeQuery,
  spendingSummaryQuery,
  topMerchantsQuery,
  trendsQuery,
} from "@/lib/queries/reports";
import { categoryListQuery } from "@/lib/queries/categories";
import {
  CategoryTrendsSchema,
  NetIncomeSchema,
  SpendingSummarySchema,
  TopMerchantsSchema,
  TrendsSchema,
} from "@/lib/validators/reports";

export default function ReportsPage(): React.ReactElement {
  requireOnboarding();
  const reports = getReportService();
  const range = initialCashFlowRange();
  const params = cashFlowParams(range);

  const state = seedQueries((client) => {
    client.setQueryData(
      netIncomeQuery(params.netIncome).queryKey,
      reports.netIncome(NetIncomeSchema.parse(params.netIncome))
    );
    if (showsTrends(range)) {
      client.setQueryData(
        trendsQuery(params.incomeTrend).queryKey,
        reports.trends(TrendsSchema.parse(params.incomeTrend))
      );
      client.setQueryData(
        trendsQuery(params.expenseTrend).queryKey,
        reports.trends(TrendsSchema.parse(params.expenseTrend))
      );
      client.setQueryData(
        categoryTrendsQuery(params.categoryTrends).queryKey,
        reports.categoryTrends(CategoryTrendsSchema.parse(params.categoryTrends))
      );
    }
    client.setQueryData(
      spendingSummaryQuery(params.spendingSummary).queryKey,
      reports.spendingSummary(SpendingSummarySchema.parse(params.spendingSummary))
    );
    client.setQueryData(
      topMerchantsQuery(params.topMerchants).queryKey,
      reports.topMerchants(TopMerchantsSchema.parse(params.topMerchants))
    );
    client.setQueryData(categoryListQuery().queryKey, getCategoryService().getAll());
  });

  return (
    <HydrationBoundary state={state}>
      <ReportsClient initialRange={range} />
    </HydrationBoundary>
  );
}
