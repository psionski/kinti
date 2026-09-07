"use client";

import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMonth } from "@/lib/format";
import { useYAxisWidth } from "@/hooks/use-y-axis-width";
import type { TrendPoint } from "@/lib/validators/reports";

const chartConfig = {
  rate: { label: "Savings Rate", color: "var(--chart-2)" },
} satisfies ChartConfig;

interface SavingsRateChartProps {
  incomeTrend: TrendPoint[];
  expenseTrend: TrendPoint[];
}

interface RatePoint {
  month: string;
  rate: number;
}

function computeSavingsRateData(
  incomeTrend: TrendPoint[],
  expenseTrend: TrendPoint[]
): RatePoint[] {
  const expenseMap = new Map<string, number>();
  for (const p of expenseTrend) {
    expenseMap.set(p.month, p.total);
  }

  return incomeTrend
    .map((p) => {
      const expenses = expenseMap.get(p.month) ?? 0;
      const rate = p.total > 0 ? ((p.total - expenses) / p.total) * 100 : 0;
      return { month: p.month, rate: Math.round(rate * 10) / 10 };
    })
    .sort((a, b) => a.month.localeCompare(b.month));
}

export function SavingsRateChart({
  incomeTrend,
  expenseTrend,
}: SavingsRateChartProps): React.ReactElement {
  const [chartRef, yAxisWidth] = useYAxisWidth();
  const chartData = computeSavingsRateData(incomeTrend, expenseTrend);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle>Savings Rate</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {chartData.length > 0 ? (
          <ChartContainer
            ref={chartRef}
            config={chartConfig}
            className="min-h-[200px] w-full flex-1"
          >
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
                tickFormatter={(value: number) => `${value}%`}
                width={yAxisWidth}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => {
                      const label =
                        (chartConfig as Record<string, { label?: string } | undefined>)[
                          name as string
                        ]?.label ?? name;
                      return `${label}: ${value as number}%`;
                    }}
                    labelFormatter={formatMonth}
                  />
                }
              />
              <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
              <ReferenceLine
                y={20}
                stroke="var(--chart-2)"
                strokeDasharray="3 3"
                strokeOpacity={0.5}
                label={{ value: "20% goal", position: "right", fontSize: 11 }}
              />
              <Area
                dataKey="rate"
                type="monotone"
                fill="var(--color-rate)"
                fillOpacity={0.15}
                stroke="var(--color-rate)"
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        ) : (
          <p className="text-muted-foreground py-10 text-center text-sm">
            No income data to calculate savings rate.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
