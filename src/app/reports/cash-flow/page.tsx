export const dynamic = "force-dynamic";

import { requireOnboarding } from "@/lib/api/require-timezone";
import { getReportService, getCategoryService } from "@/lib/api/services";
import { ReportsClient, type ReportsData } from "@/components/reports/reports-client";
import { DEFAULT_PRESET, computePresetRange, computeCompareRange } from "@/lib/date-ranges";

export default function ReportsPage(): React.ReactElement {
  requireOnboarding();
  const reportService = getReportService();
  const categoryService = getCategoryService();

  const { dateFrom, dateTo } = computePresetRange(DEFAULT_PRESET);
  const computed = computeCompareRange({ dateFrom, dateTo });

  const balance = reportService.netIncome({ dateFrom, dateTo });
  const incomeTrend = reportService.trends({ months: computed.months, type: "income" });
  const expenseTrend = reportService.trends({ months: computed.months, type: "expense" });
  const summary = reportService.spendingSummary({
    dateFrom,
    dateTo,
    groupBy: "category",
    type: "expense",
    compareDateFrom: computed.compareDateFrom,
    compareDateTo: computed.compareDateTo,
    includeTransfers: false,
  });
  const topMerchants = reportService.topMerchants({
    dateFrom,
    dateTo,
    type: "expense",
    limit: 10,
  });
  const categories = categoryService.getAll();

  const initialData: ReportsData = {
    balance,
    incomeTrend,
    expenseTrend,
    spendingTrend: expenseTrend,
    summary,
    topMerchants,
  };

  return (
    <ReportsClient
      initialData={initialData}
      initialDateRange={{ dateFrom, dateTo }}
      categories={categories}
    />
  );
}
