"use client";

import { useState } from "react";
import { Area, ComposedChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AssetHistoryResult } from "@/lib/validators/portfolio-reports";
import { Temporal } from "@js-temporal/polyfill";
import { formatAxisTick, formatCurrency, getBaseCurrency } from "@/lib/format";
import { useYAxisWidth } from "@/hooks/use-y-axis-width";
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

/**
 * Which currency the series is drawn in. A native series answers "how much of
 * this do I hold"; a base one answers "what is it worth to me", and for a
 * foreign holding those are different questions with different shapes — a US
 * position can climb in dollars while a strengthening euro flattens it. The
 * native view is the default because it is the one the asset's own numbers
 * (holdings, cost basis, price) are quoted in.
 */
type Denomination = "native" | "base";

interface ChartPoint {
  date: string;
  value: number;
}

function formatShortMonth(date: string): string {
  return Temporal.PlainDate.from(date.slice(0, 10)).toLocaleString("en-US", { month: "short" });
}

export function ValueChart({ data, currency, rangeLabel }: ValueChartProps): React.ReactElement {
  const [chartRef, yAxisWidth] = useYAxisWidth();
  const baseCurrency = getBaseCurrency();
  const convertible = currency !== baseCurrency;
  const [denomination, setDenomination] = useState<Denomination>("native");
  const inBase = convertible && denomination === "base";

  // A point converts only where a rate was cached for its date. Dropping the
  // rest rather than carrying the value through unconverted is the same rule
  // the cross-currency totals follow: a gap in the line is honest, a euro
  // figure that is secretly dollars is not.
  const chartData: ChartPoint[] = data.timeline
    .filter((p) => p.value !== null && (!inBase || p.rate !== null))
    .map((p) => ({
      date: p.date,
      value: inBase ? p.value! * p.rate! : p.value!,
    }));

  const displayCurrency = inBase ? baseCurrency : currency;
  const stats = seriesExtremes(chartData.map((p) => p.value));
  const amount = (value: number): string => formatCurrency(value, displayCurrency);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Value Over Time</CardTitle>
        {convertible && (
          <div className="flex shrink-0 gap-1" role="group" aria-label="Chart currency">
            {(
              [
                ["native", currency],
                ["base", baseCurrency],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                variant={denomination === value ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                aria-pressed={denomination === value}
                onClick={() => setDenomination(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {chartData.length > 0 ? (
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
                tickFormatter={formatShortMonth}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                // Bare numbers, in a gutter sized to them: the stats row and
                // the tooltip below both name the currency.
                tickFormatter={formatAxisTick}
                width={yAxisWidth}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) =>
                      `Value: ${formatCurrency(value as number, displayCurrency)}`
                    }
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
          <p className="text-muted-foreground py-10 text-center text-sm">
            {inBase
              ? `No cached ${currency}→${baseCurrency} rates for this range.`
              : "Not enough data yet."}
          </p>
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
