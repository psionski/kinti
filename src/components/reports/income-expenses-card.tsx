"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatMonth } from "@/lib/format";
import type { TrendPoint, NetIncomeResult } from "@/lib/validators/reports";

// Match the green/red semantics of the KPI labels above the chart
// (text-green-600 / text-red-600) so the areas read as income vs. expenses.
const chartConfig = {
  income: { label: "Income", color: "var(--color-green-600)" },
  expenses: { label: "Expenses", color: "var(--color-red-600)" },
} satisfies ChartConfig;

interface IncomeExpensesCardProps {
  balance: NetIncomeResult;
  incomeTrend: TrendPoint[];
  expenseTrend: TrendPoint[];
  showChart?: boolean;
}

interface MergedPoint {
  month: string;
  income: number;
  expenses: number;
}

function mergeIncomeExpenseTrends(
  incomeTrend: TrendPoint[],
  expenseTrend: TrendPoint[]
): MergedPoint[] {
  const map = new Map<string, MergedPoint>();
  for (const p of incomeTrend) {
    map.set(p.month, { month: p.month, income: p.total, expenses: 0 });
  }
  for (const p of expenseTrend) {
    const existing = map.get(p.month);
    if (existing) {
      existing.expenses = p.total;
    } else {
      map.set(p.month, { month: p.month, income: 0, expenses: p.total });
    }
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export function IncomeExpensesCard({
  balance,
  incomeTrend,
  expenseTrend,
  showChart = true,
}: IncomeExpensesCardProps): React.ReactElement {
  const chartData = mergeIncomeExpenseTrends(incomeTrend, expenseTrend);

  const netIsPositive = balance.netIncome >= 0;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle>Income vs Expenses</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col space-y-4">
        {/* KPI row */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-muted-foreground text-xs">Income</p>
            <p className="text-lg font-semibold text-green-600">
              {formatCurrency(balance.totalIncome)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Expenses</p>
            <p className="text-lg font-semibold text-red-600">
              {formatCurrency(balance.totalExpenses)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Net Income</p>
            <p
              className={`text-lg font-semibold ${netIsPositive ? "text-green-600" : "text-red-600"}`}
            >
              {netIsPositive ? "+" : ""}
              {formatCurrency(balance.netIncome)}
            </p>
          </div>
        </div>

        {/* Dual area chart */}
        {showChart && chartData.length > 0 ? (
          <ChartContainer config={chartConfig} className="min-h-[200px] w-full flex-1">
            <AreaChart data={chartData} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={formatMonth}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) => `€${value}`}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => {
                      const label =
                        (chartConfig as Record<string, { label?: string } | undefined>)[
                          name as string
                        ]?.label ?? name;
                      return `${label}: €${(value as number).toLocaleString("de-DE", { minimumFractionDigits: 2 })}`;
                    }}
                    labelFormatter={formatMonth}
                  />
                }
              />
              <Area
                dataKey="income"
                type="monotone"
                fill="var(--color-income)"
                fillOpacity={0.15}
                stroke="var(--color-income)"
                strokeWidth={2}
              />
              <Area
                dataKey="expenses"
                type="monotone"
                fill="var(--color-expenses)"
                fillOpacity={0.15}
                stroke="var(--color-expenses)"
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        ) : showChart ? (
          <p className="text-muted-foreground py-10 text-center text-sm">
            No data for this period.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
