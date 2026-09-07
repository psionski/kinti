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
import { formatAxisTick, formatCurrency } from "@/lib/format";
import { useYAxisWidth } from "@/hooks/use-y-axis-width";
import type { NetWorthPoint } from "@/lib/validators/portfolio-reports";
import { Temporal } from "@js-temporal/polyfill";

const chartConfig = {
  cash: {
    label: "Cash",
    color: "var(--chart-1)",
  },
  assets: {
    label: "Assets",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

interface NetWorthChartProps {
  data: NetWorthPoint[];
}

function formatXAxisDate(dates: string[]): (date: string) => string {
  if (dates.length === 0) return (d: string) => d;

  const years = new Set(dates.map((d) => d.split("-")[0]));
  const multiYear = years.size > 1;

  return (date: string): string => {
    const d = Temporal.PlainDate.from(date);
    if (multiYear) {
      return d.toLocaleString("en-US", { month: "short", year: "2-digit" });
    }
    return d.toLocaleString("en-US", { month: "short" });
  };
}

export function NetWorthChart({ data }: NetWorthChartProps): React.ReactElement {
  const [chartRef, yAxisWidth] = useYAxisWidth();
  const chartData = data.map((point) => ({
    date: point.date,
    cash: point.cash,
    assets: point.assets,
  }));

  const dateFormatter = formatXAxisDate(data.map((p) => p.date));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Net Worth Over Time</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length > 0 ? (
          <ChartContainer
            ref={chartRef}
            config={chartConfig}
            className="max-h-[350px] min-h-[250px] w-full"
          >
            <AreaChart data={chartData} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={dateFormatter}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                // Bare numbers, in a gutter sized to them: the tooltip names
                // the currency.
                tickFormatter={formatAxisTick}
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
                      return `${label}: ${formatCurrency(value as number)}`;
                    }}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Area
                dataKey="cash"
                type="monotone"
                fill="var(--color-cash)"
                fillOpacity={0.2}
                stroke="var(--color-cash)"
                strokeWidth={2}
                stackId="net-worth"
              />
              <Area
                dataKey="assets"
                type="monotone"
                fill="var(--color-assets)"
                fillOpacity={0.2}
                stroke="var(--color-assets)"
                strokeWidth={2}
                stackId="net-worth"
              />
            </AreaChart>
          </ChartContainer>
        ) : (
          <p className="text-muted-foreground py-10 text-center text-sm">No data yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
