"use client";

import { Area, ComposedChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AssetHistoryResult } from "@/lib/validators/portfolio-reports";
import { Temporal } from "@js-temporal/polyfill";
import { formatCurrency, formatCurrencyCompact } from "@/lib/format";
import { ChartStats, seriesExtremes } from "./chart-stats";

/** Value only — price per unit has its own card and its own scale. */
const chartConfig = {
  value: {
    label: "Value",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

interface ValueChartProps {
  data: AssetHistoryResult;
  currency: string;
  /** Names the span high/low were taken over, e.g. "6M" or "All-time". */
  rangeLabel: string;
}

interface ChartPoint {
  date: string;
  value: number;
}

function formatShortMonth(date: string): string {
  return Temporal.PlainDate.from(date.slice(0, 10)).toLocaleString("en-US", { month: "short" });
}

export function ValueChart({ data, currency, rangeLabel }: ValueChartProps): React.ReactElement {
  const chartData: ChartPoint[] = data.timeline
    .filter((p) => p.value !== null)
    .map((p) => ({
      date: p.date,
      value: p.value!,
    }));

  const stats = seriesExtremes(chartData.map((p) => p.value));
  const amount = (value: number): string => formatCurrency(value, currency);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Value Over Time</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length > 0 ? (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[260px] w-full sm:h-[300px]"
          >
            <ComposedChart data={chartData} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={formatShortMonth}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => formatCurrencyCompact(v, currency)}
                width={64} // Recharts' 60px default clips six-figure labels.
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => `Value: ${formatCurrency(value as number, currency)}`}
                    labelFormatter={(label) => {
                      return Temporal.PlainDate.from((label as string).slice(0, 10)).toLocaleString(
                        "en-US",
                        {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        }
                      );
                    }}
                  />
                }
              />
              <Area
                dataKey="value"
                type="monotone"
                fill="var(--color-value)"
                fillOpacity={0.15}
                stroke="var(--color-value)"
                strokeWidth={2}
              />
            </ComposedChart>
          </ChartContainer>
        ) : (
          <p className="text-muted-foreground py-10 text-center text-sm">Not enough data yet.</p>
        )}
        {stats && (
          <ChartStats
            stats={[
              { label: "Current", value: amount(stats.current) },
              { label: `${rangeLabel} high`, value: amount(stats.high) },
              { label: `${rangeLabel} low`, value: amount(stats.low) },
            ]}
          />
        )}
      </CardContent>
    </Card>
  );
}
