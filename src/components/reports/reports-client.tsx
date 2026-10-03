"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { DateRangeFilter } from "./date-range-filter";
import { computeCompareRange, type ComputedRange } from "@/lib/date-ranges";
import { IncomeExpensesCard } from "./income-expenses-card";
import { SavingsRateChart } from "@/components/charts/savings-rate-chart";
import { AverageSpendPills } from "./average-spend-pills";
import { CategoryTrendsChart } from "@/components/charts/category-trends-chart";
import { CategoryChangesCard } from "./category-changes-card";
import { MerchantTable } from "./merchant-table";
import { ReportSection } from "./report-section";
import { cashFlowParams, showsTrends } from "./cash-flow-query";
import {
  categoryTrendsQuery,
  netIncomeQuery,
  spendingSummaryQuery,
  topMerchantsQuery,
  trendsQuery,
} from "@/lib/queries/reports";
import { categoryListQuery } from "@/lib/queries/categories";

interface ReportsClientProps {
  /** The range the server seeded the report for. */
  initialRange: ComputedRange;
}

export function ReportsClient({ initialRange }: ReportsClientProps): React.ReactElement {
  const [range, setRange] = useState<ComputedRange>(initialRange);
  const trendsShown = showsTrends(range);
  const params = cashFlowParams(range);

  // While a new range loads, each section keeps the previous range's figures
  // on screen, dimmed, until its own arrive.
  const balance = useQuery({
    ...netIncomeQuery(params.netIncome),
    placeholderData: keepPreviousData,
  });
  const incomeTrend = useQuery({
    ...trendsQuery(params.incomeTrend),
    placeholderData: keepPreviousData,
    enabled: trendsShown,
  });
  const expenseTrend = useQuery({
    ...trendsQuery(params.expenseTrend),
    placeholderData: keepPreviousData,
    enabled: trendsShown,
  });
  const categoryTrends = useQuery({
    ...categoryTrendsQuery(params.categoryTrends),
    placeholderData: keepPreviousData,
    enabled: trendsShown,
  });
  const summary = useQuery({
    ...spendingSummaryQuery(params.spendingSummary),
    placeholderData: keepPreviousData,
  });
  const merchants = useQuery({
    ...topMerchantsQuery(params.topMerchants),
    placeholderData: keepPreviousData,
  });
  const categories = useQuery(categoryListQuery()).data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Cash Flow Report</h1>
      </div>

      <DateRangeFilter onChange={setRange} />

      {trendsShown ? (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            <ReportSection
              title="Income vs Expenses"
              queries={[balance, incomeTrend, expenseTrend]}
            >
              {(balanceData, income, expense) => (
                <IncomeExpensesCard
                  balance={balanceData}
                  trends={{ income: income.points, expense: expense.points }}
                />
              )}
            </ReportSection>
            <ReportSection title="Savings Rate" queries={[incomeTrend, expenseTrend]}>
              {(income, expense) => (
                <SavingsRateChart incomeTrend={income.points} expenseTrend={expense.points} />
              )}
            </ReportSection>
            <ReportSection title="Average Spend by Category" queries={[summary]}>
              {(summaryData) => (
                <AverageSpendPills
                  groups={summaryData.groups}
                  // The months of the period these totals cover, which while a
                  // new range loads is still the previous one.
                  months={computeCompareRange(summaryData.period).months}
                  categories={categories}
                />
              )}
            </ReportSection>
          </div>
          <ReportSection title="Spending Trends" queries={[categoryTrends]}>
            {(data) => <CategoryTrendsChart data={data} />}
          </ReportSection>
        </>
      ) : (
        <>
          <ReportSection title="Income vs Expenses" queries={[balance]}>
            {(balanceData) => <IncomeExpensesCard balance={balanceData} />}
          </ReportSection>
          <ReportSection title="Spending Changes vs Previous Period" queries={[summary]}>
            {(summaryData) => <CategoryChangesCard groups={summaryData.groups} />}
          </ReportSection>
        </>
      )}

      <ReportSection title="Top Merchants" queries={[merchants]}>
        {(data) => <MerchantTable data={data.merchants} />}
      </ReportSection>
    </div>
  );
}
