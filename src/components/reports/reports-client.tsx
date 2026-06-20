"use client";

import { useState, useCallback } from "react";
import { DateRangeFilter } from "./date-range-filter";
import { computeCompareRange, type ComputedRange, type DateRange } from "@/lib/date-ranges";
import { IncomeExpensesCard } from "./income-expenses-card";
import { SavingsRateChart } from "@/components/charts/savings-rate-chart";
import { TrendsChart } from "@/components/charts/trends-chart";
import { CategoryChangesCard } from "./category-changes-card";
import { MerchantTable } from "./merchant-table";
import type {
  NetIncomeResult,
  TrendsResult,
  SpendingSummaryResult,
  TopMerchantsResult,
} from "@/lib/validators/reports";
import type { CategoryWithCountResponse } from "@/lib/validators/categories";

export interface ReportsData {
  balance: NetIncomeResult;
  incomeTrend: TrendsResult;
  expenseTrend: TrendsResult;
  spendingTrend: TrendsResult;
  summary: SpendingSummaryResult;
  topMerchants: TopMerchantsResult;
}

interface ReportsClientProps {
  initialData: ReportsData;
  initialDateRange: DateRange;
  categories: CategoryWithCountResponse[];
}

export function ReportsClient({
  initialData,
  initialDateRange,
  categories,
}: ReportsClientProps): React.ReactElement {
  const [data, setData] = useState<ReportsData>(initialData);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<ComputedRange>(computeCompareRange(initialDateRange));
  const isLongRange = range.months >= 3;

  const fetchAll = useCallback(async (r: ComputedRange): Promise<void> => {
    setLoading(true);
    try {
      const params = (extra: Record<string, string>): string =>
        new URLSearchParams(extra).toString();

      const [balanceRes, incomeTrendRes, expenseTrendRes, summaryRes, merchantsRes] =
        await Promise.all([
          fetch(`/api/reports/income?${params({ dateFrom: r.dateFrom, dateTo: r.dateTo })}`),
          fetch(`/api/reports/trends?${params({ months: String(r.months), type: "income" })}`),
          fetch(`/api/reports/trends?${params({ months: String(r.months), type: "expense" })}`),
          fetch(
            `/api/reports/summary?${params({
              dateFrom: r.dateFrom,
              dateTo: r.dateTo,
              groupBy: "category",
              type: "expense",
              compareDateFrom: r.compareDateFrom,
              compareDateTo: r.compareDateTo,
            })}`
          ),
          fetch(
            `/api/reports/top-merchants?${params({
              dateFrom: r.dateFrom,
              dateTo: r.dateTo,
              type: "expense",
            })}`
          ),
        ]);

      if (
        balanceRes.ok &&
        incomeTrendRes.ok &&
        expenseTrendRes.ok &&
        summaryRes.ok &&
        merchantsRes.ok
      ) {
        const [balance, incomeTrend, expenseTrend, summary, topMerchants] = await Promise.all([
          balanceRes.json() as Promise<NetIncomeResult>,
          incomeTrendRes.json() as Promise<TrendsResult>,
          expenseTrendRes.json() as Promise<TrendsResult>,
          summaryRes.json() as Promise<SpendingSummaryResult>,
          merchantsRes.json() as Promise<TopMerchantsResult>,
        ]);
        setData({
          balance,
          incomeTrend,
          expenseTrend,
          spendingTrend: expenseTrend,
          summary,
          topMerchants,
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  function handleRangeChange(newRange: ComputedRange): void {
    setRange(newRange);
    void fetchAll(newRange);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Cash Flow Report</h1>
      </div>

      <DateRangeFilter onChange={handleRangeChange} />

      <div className={loading ? "pointer-events-none opacity-60" : ""}>
        <div className="space-y-6">
          {isLongRange ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              <IncomeExpensesCard
                balance={data.balance}
                incomeTrend={data.incomeTrend.points}
                expenseTrend={data.expenseTrend.points}
              />
              <SavingsRateChart
                incomeTrend={data.incomeTrend.points}
                expenseTrend={data.expenseTrend.points}
              />
              <TrendsChart
                data={data.spendingTrend.points}
                categories={categories}
                months={range.months}
              />
            </div>
          ) : (
            <>
              <IncomeExpensesCard
                balance={data.balance}
                incomeTrend={data.incomeTrend.points}
                expenseTrend={data.expenseTrend.points}
                showChart={false}
              />
              <CategoryChangesCard groups={data.summary.groups} />
            </>
          )}

          <MerchantTable data={data.topMerchants.merchants} />
        </div>
      </div>
    </div>
  );
}
