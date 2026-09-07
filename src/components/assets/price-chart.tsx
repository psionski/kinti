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
  /**
   * Unit the plotted values are in — the asset's own currency for a price
   * series, the *base* currency for an exchange-rate one.
   */
  currency: string;
  /** Names the span high/low were taken over, e.g. "6M" or "All-time". */
  rangeLabel: string;
  /**
   * Card heading. Defaults to "Price History"; an exchange-rate series passes
   * its own, since "the price of one USD" reads as a rate to everyone but the
   * cache that stores it.
   */
  title?: string;
  /** Optional line under the heading naming what one unit is, e.g. "1 USD in EUR". */
  caption?: string;
  /** Shown when there aren't two points to draw a line between. */
  emptyMessage?: string;
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

export function PriceChart({
  data,
  currency,
  rangeLabel,
  title = "Price History",
  caption,
  emptyMessage = "Not enough price data.",
}: PriceChartProps): React.ReactElement {
  const [chartRef, yAxisWidth] = useYAxisWidth();
  const stats = seriesExtremes(data.map((point) => point.pricePerUnit));
  const price = (value: number): string => formatUnitPrice(value, currency);
  const heading = (
    <CardHeader>
      <CardTitle>{title}</CardTitle>
      {caption && <p className="text-muted-foreground text-xs">{caption}</p>}
    </CardHeader>
  );

  if (data.length < 2) {
    return (
      <Card>
        {heading}
        <CardContent>
          <p className="text-muted-foreground py-10 text-center text-sm">{emptyMessage}</p>
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
      {heading}
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
