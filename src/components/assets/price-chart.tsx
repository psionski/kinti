"use client";

import { Area, ComposedChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Temporal } from "@js-temporal/polyfill";
import { formatAxisTick, formatUnitPrice } from "@/lib/format";
import { useYAxisWidth } from "@/hooks/use-y-axis-width";
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
  const [chartRef, yAxisWidth] = useYAxisWidth();
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
        <ChartContainer
          ref={chartRef}
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
              tickFormatter={formatDate}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              // Unit prices span everything from six figures to sub-cent coins,
              // so both the tick format and the gutter follow the data.
              tickFormatter={formatAxisTick}
              width={yAxisWidth}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(label) => formatDate(label as string)}
                  formatter={(value) => formatUnitPrice(value as number, currency)}
                />
              }
            />
            <Area
              dataKey="price"
              type="monotone"
              fill="var(--color-price)"
              fillOpacity={0.15}
              stroke="var(--color-price)"
              strokeWidth={2}
            />
          </ComposedChart>
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
