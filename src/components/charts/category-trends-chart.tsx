"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatCurrencyCompact, formatMonth } from "@/lib/format";
import { fallbackColor } from "@/lib/chart-colors";
import type { CategoryTrendsResult } from "@/lib/validators/reports";

interface CategoryTrendsChartProps {
  data: CategoryTrendsResult;
}

export function CategoryTrendsChart({ data }: CategoryTrendsChartProps): React.ReactElement {
  const chartConfig: ChartConfig = {};
  const fallbackCount = data.series.filter((s) => !s.color).length;
  let fallbackIndex = 0;
  for (const s of data.series) {
    chartConfig[s.key] = {
      label: s.name,
      color: s.color ?? fallbackColor(fallbackIndex++, fallbackCount),
    };
  }

  const chartData = data.months.map((month, i) => {
    const row: Record<string, string | number> = { month };
    for (const s of data.series) {
      row[s.key] = s.values[i]!;
    }
    return row;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spending Trends</CardTitle>
      </CardHeader>
      <CardContent>
        {data.series.length > 0 ? (
          <ChartContainer config={chartConfig} className="max-h-[350px] min-h-[250px] w-full">
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
                tickFormatter={(value: number) => formatCurrencyCompact(value)}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    reverse
                    labelFormatter={(label) => formatMonth(label as string)}
                    formatter={(value, name) => {
                      const label = chartConfig[name as string]?.label ?? name;
                      return (
                        <div className="flex w-full items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                            style={{ backgroundColor: `var(--color-${name})` }}
                          />
                          <span className="text-muted-foreground">{label}</span>
                          <span className="text-foreground ml-auto font-mono font-medium tabular-nums">
                            {formatCurrency(value as number)}
                          </span>
                        </div>
                      );
                    }}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              {/* Most stable series first → rendered at the bottom of the stack. */}
              {data.series.map((s) => (
                <Area
                  key={s.key}
                  dataKey={s.key}
                  type="monotone"
                  stackId="spend"
                  fill={`var(--color-${s.key})`}
                  fillOpacity={0.2}
                  stroke={`var(--color-${s.key})`}
                  strokeWidth={2}
                />
              ))}
            </AreaChart>
          </ChartContainer>
        ) : (
          <p className="text-muted-foreground py-10 text-center text-sm">
            No spending data for this period.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
