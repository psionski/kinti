"use client";

import { useState, useCallback, useEffect } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategorySelectItems } from "@/components/categories/category-select-items";
import { formatCurrency, formatCurrencyCompact, formatMonth } from "@/lib/format";
import type { TrendPoint, TrendsResult } from "@/lib/validators/reports";
import type { CategoryWithCountResponse } from "@/lib/validators/categories";

const chartConfig = {
  total: { label: "Spending", color: "var(--chart-1)" },
} satisfies ChartConfig;

interface TrendsChartProps {
  data: TrendPoint[];
  categories: CategoryWithCountResponse[];
  months: number;
}

export function TrendsChart({
  data: initialData,
  categories,
  months,
}: TrendsChartProps): React.ReactElement {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);

  // Reset data when initialData changes (parent date range changed)
  useEffect(() => {
    setData(initialData);
    setSelectedCategory("all");
  }, [initialData]);

  const fetchTrends = useCallback(
    async (categoryId: string): Promise<void> => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          months: String(months),
          type: "expense",
        });
        if (categoryId !== "all") {
          params.set("categoryId", categoryId);
        }
        const res = await fetch(`/api/reports/trends?${params}`);
        if (res.ok) {
          setData(((await res.json()) as TrendsResult).points);
        }
      } finally {
        setLoading(false);
      }
    },
    [months]
  );

  function handleCategoryChange(value: string): void {
    setSelectedCategory(value);
    void fetchTrends(value);
  }

  const chartData = data.map((point) => ({
    month: point.month,
    total: point.total,
  }));

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Spending Trends</CardTitle>
        <Select value={selectedCategory} onValueChange={handleCategoryChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <CategorySelectItems categories={categories} />
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <div className={`flex flex-1 flex-col ${loading ? "pointer-events-none opacity-60" : ""}`}>
          {chartData.length > 0 ? (
            <ChartContainer config={chartConfig} className="min-h-[200px] w-full flex-1">
              <AreaChart data={chartData} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={formatMonth}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value: number) => formatCurrencyCompact(value)}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => {
                        const label = chartConfig[name as keyof typeof chartConfig]?.label ?? name;
                        return `${label}: ${formatCurrency(value as number)}`;
                      }}
                      labelFormatter={formatMonth}
                    />
                  }
                />
                <Area
                  dataKey="total"
                  type="monotone"
                  fill="var(--color-total)"
                  fillOpacity={0.2}
                  stroke="var(--color-total)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          ) : (
            <p className="text-muted-foreground py-10 text-center text-sm">
              No spending data for this period.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
