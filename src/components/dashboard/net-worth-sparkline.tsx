"use client";

import { Area, AreaChart, type TooltipValueType } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatCurrency } from "@/lib/format";
import type { NetWorthPoint } from "@/lib/validators/portfolio-reports";

interface NetWorthSparklineProps {
  data: NetWorthPoint[];
}

const chartConfig = {
  total: {
    label: "Net Worth",
    color: "var(--color-chart-1)",
  },
} satisfies ChartConfig;

interface ChartDatum {
  date: string;
  total: number;
}

function toChartData(data: NetWorthPoint[]): ChartDatum[] {
  return data.map((p) => ({
    date: p.date,
    total: p.total,
  }));
}

function tooltipFormatter(value: TooltipValueType | undefined): string {
  return formatCurrency(Number(value));
}

export function NetWorthSparkline({ data }: NetWorthSparklineProps): React.ReactElement {
  if (data.length < 2) {
    return <></>;
  }

  const chartData = toChartData(data);

  return (
    <ChartContainer config={chartConfig} className="h-[60px] w-full">
      <AreaChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="fillTotal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-total)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--color-total)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <ChartTooltip
          content={
            <ChartTooltipContent labelKey="date" formatter={tooltipFormatter} hideIndicator />
          }
        />
        <Area
          type="monotone"
          dataKey="total"
          stroke="var(--color-total)"
          strokeWidth={1.5}
          fill="url(#fillTotal)"
          fillOpacity={1}
        />
      </AreaChart>
    </ChartContainer>
  );
}
