"use client";

import { useState, useMemo, useCallback } from "react";
import { Pie, PieChart, Cell, Label } from "recharts";
import { ArrowLeft } from "lucide-react";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CategorySpendingItem } from "@/lib/validators/reports";

const FALLBACK_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

interface BreadcrumbEntry {
  id: number | null;
  name: string;
}

interface CategoryDonutChartProps {
  data: CategorySpendingItem[];
  monthLabel: string;
}

interface ChartEntry {
  name: string;
  value: number;
  percentage: number;
  color: string;
  categoryId: number | null;
  hasChildren: boolean;
}

export function CategoryDonutChart({
  data,
  monthLabel,
}: CategoryDonutChartProps): React.ReactElement {
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbEntry[]>([{ id: null, name: "All" }]);
  const currentParentId = breadcrumb[breadcrumb.length - 1].id;

  // Build a set of category IDs that have children in the dataset
  const parentIds = useMemo(() => {
    const set = new Set<number>();
    for (const item of data) {
      if (item.parentId !== null) set.add(item.parentId);
    }
    return set;
  }, [data]);

  const chartData = useMemo((): ChartEntry[] => {
    // Filter to items at the current hierarchy level
    const levelItems = data.filter((item) => item.parentId === currentParentId);

    // When drilled in, check if the parent has direct spend not covered by children
    const entries: Array<{
      name: string;
      rawValue: number;
      color: string | null;
      categoryId: number | null;
      hasChildren: boolean;
    }> = [];

    if (currentParentId !== null) {
      const parent = data.find((item) => item.categoryId === currentParentId);
      if (parent && parent.total > 0) {
        entries.push({
          name: `Direct`,
          rawValue: parent.total,
          color: null,
          categoryId: null,
          hasChildren: false,
        });
      }
    }

    for (const item of levelItems) {
      const hasChildren = item.categoryId !== null && parentIds.has(item.categoryId);
      entries.push({
        name: item.categoryName ?? "Uncategorized",
        rawValue: hasChildren ? item.rollupTotal : item.total,
        color: item.color,
        categoryId: item.categoryId,
        hasChildren,
      });
    }

    // Compute percentages from this level's total
    const grandTotal = entries.reduce((s, e) => s + e.rawValue, 0);
    let fallbackIndex = 0;

    return entries
      .filter((e) => e.rawValue > 0)
      .sort((a, b) => b.rawValue - a.rawValue)
      .map((entry) => ({
        name: entry.name,
        value: entry.rawValue,
        percentage: grandTotal > 0 ? Math.round((entry.rawValue / grandTotal) * 10000) / 100 : 0,
        color: entry.color ?? FALLBACK_COLORS[fallbackIndex++ % FALLBACK_COLORS.length],
        categoryId: entry.categoryId,
        hasChildren: entry.hasChildren,
      }));
  }, [data, currentParentId, parentIds]);

  const chartConfig = useMemo(
    () =>
      Object.fromEntries(
        chartData.map((item) => [item.name, { label: item.name, color: item.color }])
      ) satisfies ChartConfig,
    [chartData]
  );

  const handleClick = useCallback(
    (_: unknown, index: number) => {
      const entry = chartData[index];
      if (!entry?.hasChildren || entry.categoryId === null) return;
      setBreadcrumb((prev) => [...prev, { id: entry.categoryId!, name: entry.name }]);
    },
    [chartData]
  );

  const isDrilledIn = breadcrumb.length > 1;

  function handleGoUp(): void {
    setBreadcrumb((prev) => prev.slice(0, -1));
  }

  return (
    <Card className="gap-0">
      <CardHeader>
        <CardTitle>Spending by Category &mdash; {monthLabel}</CardTitle>
        <CardDescription>Tap to drill down</CardDescription>
      </CardHeader>
      <CardContent>
        {chartData.length > 0 ? (
          <div className="mx-auto w-full max-w-xs">
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <PieChart accessibilityLayer key={currentParentId ?? "root"}>
                <ChartTooltip
                  content={({ payload }) => {
                    const item = payload?.[0];
                    if (!item) return null;
                    return (
                      <div className="border-border/50 bg-background rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
                        <div className="text-foreground font-medium">{item.name}</div>
                        <div className="text-muted-foreground font-mono">
                          {formatCurrency(item.value as number)}
                        </div>
                      </div>
                    );
                  }}
                />
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={90}
                  strokeWidth={2}
                  onClick={handleClick}
                  animationBegin={0}
                  animationDuration={300}
                  animationEasing="ease-out"
                >
                  {chartData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.color}
                      style={{ cursor: entry.hasChildren ? "pointer" : "default" }}
                    />
                  ))}
                  <Label
                    content={() => (
                      <g>
                        {isDrilledIn ? (
                          <foreignObject x="50%" y="50%" width={1} height={1} overflow="visible">
                            <button
                              onClick={handleGoUp}
                              className="bg-muted hover:bg-accent text-muted-foreground hover:text-foreground flex -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full p-2.5 transition-colors"
                            >
                              <ArrowLeft className="size-6" />
                            </button>
                          </foreignObject>
                        ) : null}
                      </g>
                    )}
                  />
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 pt-2 text-xs">
              {chartData.map((entry) => (
                <div key={entry.name} className="flex items-center gap-1.5">
                  <span
                    className="inline-block size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-muted-foreground">{entry.name}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground py-10 text-center text-sm">No category data yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
