"use client";

import { useState, useMemo } from "react";
import { Pie, PieChart, Cell, Tooltip } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import type { AllocationResult } from "@/lib/validators/portfolio-reports";

const FALLBACK_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

type ViewMode = "asset" | "type";

interface ChartEntry {
  name: string;
  value: number;
  pct: number;
  color: string;
}

interface AllocationChartProps {
  data: AllocationResult;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartEntry }>;
}): React.ReactElement | null {
  if (!active || !payload?.length) return null;
  const entry = payload[0].payload;
  return (
    <div className="bg-background border-border rounded-md border px-3 py-1.5 text-xs shadow-sm">
      <p className="font-medium">{entry.name}</p>
      <p className="text-muted-foreground">
        {formatCurrency(entry.value)} &middot; {entry.pct.toFixed(1)}%
      </p>
    </div>
  );
}

export function AllocationChart({ data }: AllocationChartProps): React.ReactElement {
  const [view, setView] = useState<ViewMode>("asset");

  const chartData = useMemo((): ChartEntry[] => {
    const items =
      view === "asset"
        ? data.byAsset.map((a) => ({ name: a.name, value: a.currentValue, pct: a.pct }))
        : data.byType.map((t) => ({ name: t.type, value: t.currentValue, pct: t.pct }));

    return items
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value)
      .map((item, i) => ({
        ...item,
        color: FALLBACK_COLORS[i % FALLBACK_COLORS.length],
      }));
  }, [data, view]);

  const chartConfig = useMemo(
    () =>
      Object.fromEntries(
        chartData.map((item) => [item.name, { label: item.name, color: item.color }])
      ) satisfies ChartConfig,
    [chartData]
  );

  const hasData = chartData.length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Allocation</CardTitle>
          <div className="flex gap-1">
            <Button
              variant={view === "asset" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("asset")}
            >
              By Asset
            </Button>
            <Button
              variant={view === "type" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("type")}
            >
              By Type
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <div className="mx-auto w-full max-w-xs">
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <PieChart accessibilityLayer>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={90}
                  strokeWidth={2}
                  animationBegin={0}
                  animationDuration={300}
                  animationEasing="ease-out"
                >
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ChartContainer>
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 pt-2 text-xs">
              {chartData.map((entry) => (
                <div key={entry.name} className="flex items-center gap-1.5">
                  <span
                    className="inline-block size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-muted-foreground">
                    {entry.name} {entry.pct.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground py-10 text-center text-sm">No allocation data yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
