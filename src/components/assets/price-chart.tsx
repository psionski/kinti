"use client";

import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Temporal } from "@js-temporal/polyfill";
import { formatAxisTick, formatUnitPrice } from "@/lib/format";
import { ChartStats, seriesExtremes } from "./chart-stats";

interface PricePoint {
  pricePerUnit: number;
  recordedAt: string;
}

interface PriceChartProps {
  data: PricePoint[];
  currency: string;
  /** Names the span high/low were taken over, e.g. "6M" or "All-time". */
  rangeLabel: string;
}

const chartConfig = {
  price: {
    label: "Price",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

function formatDate(dateStr: string): string {
  return Temporal.PlainDate.from(dateStr.slice(0, 10)).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function PriceChart({ data, currency, rangeLabel }: PriceChartProps): React.ReactElement {
  const stats = seriesExtremes(data.map((point) => point.pricePerUnit));
  const price = (value: number): string => formatUnitPrice(value, currency);

  if (data.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Price History</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground py-10 text-center text-sm">Not enough price data.</p>
          {/* A lone observation can't be charted but is still the current price. */}
          {stats && <ChartStats stats={[{ label: "Current", value: price(stats.current) }]} />}
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map((point) => ({
    date: point.recordedAt,
    price: point.pricePerUnit,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Price History</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-[260px] w-full sm:h-[300px]">
          <LineChart data={chartData} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={formatDate}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              // Unit prices span everything from six figures to sub-cent coins;
              // significant digits cover both ends where fraction digits can't.
              tickFormatter={formatAxisTick}
              width={72}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(label) => formatDate(label as string)}
                  formatter={(value) => formatUnitPrice(value as number, currency)}
                />
              }
            />
            <Line
              dataKey="price"
              type="monotone"
              stroke="var(--color-price)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ChartContainer>
        {stats && (
          <ChartStats
            stats={[
              { label: "Current", value: price(stats.current) },
              { label: `${rangeLabel} high`, value: price(stats.high) },
              { label: `${rangeLabel} low`, value: price(stats.low) },
            ]}
          />
        )}
      </CardContent>
    </Card>
  );
}
