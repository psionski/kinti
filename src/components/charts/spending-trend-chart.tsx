"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatCurrencyCompact, formatMonth } from "@/lib/format";
import type { TrendPoint } from "@/lib/validators/reports";

const chartConfig = {
  total: {
    label: "Spending",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

interface SpendingTrendChartProps {
  data: TrendPoint[];
}

export function SpendingTrendChart({ data }: SpendingTrendChartProps): React.ReactElement {
  const chartData = data.map((point) => ({
    month: formatMonth(point.month),
    total: point.total,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spending Trend</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length > 0 ? (
          <ChartContainer config={chartConfig} className="min-h-[250px] w-full">
            <AreaChart data={chartData} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) => formatCurrencyCompact(value)}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => {
                      const label = chartConfig[name as keyof typeof chartConfig]?.label ?? name;
                      return `${label}: ${formatCurrency(value as number)}`;
                    }}
                  />
                }
              />
              <Area
                dataKey="total"
                type="monotone"
                fill="var(--color-total)"
                fillOpacity={0.2}
                stroke="var(--color-total)"
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        ) : (
          <p className="text-muted-foreground py-10 text-center text-sm">No spending data yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
