"use client";

import { Area, Line, ComposedChart, CartesianGrid, XAxis, YAxis, ReferenceDot } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AssetHistoryResult } from "@/lib/validators/portfolio-reports";
import { Temporal } from "@js-temporal/polyfill";
import { formatCurrency, formatCurrencyCompact } from "@/lib/format";

const chartConfig = {
  value: {
    label: "Value",
    color: "var(--chart-1)",
  },
  price: {
    label: "Price / Unit",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

interface ValueChartProps {
  data: AssetHistoryResult;
  currency: string;
}

interface ChartPoint {
  date: string;
  value: number;
  price: number | null;
}

function formatShortMonth(date: string): string {
  return Temporal.PlainDate.from(date.slice(0, 10)).toLocaleString("en-US", { month: "short" });
}

export function ValueChart({ data, currency }: ValueChartProps): React.ReactElement {
  const chartData: ChartPoint[] = data.timeline
    .filter((p) => p.value !== null)
    .map((p) => ({
      date: p.date,
      value: p.value!,
      price: p.price,
    }));

  // Build a date->value lookup for placing lot markers on the value axis
  const valueByDate = new Map<string, number>(chartData.map((p) => [p.date, p.value]));

  const lotMarkers = data.lots
    .filter((lot) => valueByDate.has(lot.date))
    .map((lot) => ({
      date: lot.date,
      value: valueByDate.get(lot.date)!,
      type: lot.type,
      quantity: lot.quantity,
      pricePerUnit: lot.pricePerUnit,
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Value Over Time</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length > 0 ? (
          <ChartContainer config={chartConfig} className="min-h-[250px] w-full">
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
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => {
                      const label = name === "value" ? "Value" : "Price / Unit";
                      return `${label}: ${formatCurrency(value as number, currency)}`;
                    }}
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
              <ChartLegend content={<ChartLegendContent />} />
              <Area
                dataKey="value"
                type="monotone"
                fill="var(--color-value)"
                fillOpacity={0.15}
                stroke="var(--color-value)"
                strokeWidth={2}
              />
              <Line
                dataKey="price"
                type="monotone"
                stroke="var(--color-price)"
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={false}
                connectNulls
              />
              {lotMarkers.map((marker, i) => (
                <ReferenceDot
                  key={`lot-${marker.date}-${marker.type}-${i}`}
                  x={marker.date}
                  y={marker.value}
                  r={5}
                  fill={marker.type === "buy" ? "#10b981" : "#ef4444"}
                  stroke={marker.type === "buy" ? "#10b981" : "#ef4444"}
                  strokeWidth={2}
                />
              ))}
            </ComposedChart>
          </ChartContainer>
        ) : (
          <p className="text-muted-foreground py-10 text-center text-sm">Not enough data yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
