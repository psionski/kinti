"use client";

import { Pie, PieChart, Cell } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";

const FALLBACK_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const MAX_LEGEND_ITEMS = 4;

interface AllocationItem {
  name: string;
  value: number;
  pct: number;
}

interface AllocationMiniDonutProps {
  data: AllocationItem[];
}

function buildChartConfig(data: AllocationItem[]): ChartConfig {
  const config: ChartConfig = {};
  for (let i = 0; i < data.length; i++) {
    config[data[i].name] = {
      label: data[i].name,
      color: FALLBACK_COLORS[i % FALLBACK_COLORS.length],
    };
  }
  return config;
}

function truncateName(name: string, maxLen: number = 14): string {
  if (name.length <= maxLen) return name;
  return name.slice(0, maxLen - 1) + "\u2026";
}

export function AllocationMiniDonut({ data }: AllocationMiniDonutProps): React.ReactElement {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Allocation</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState message="No allocation data." />
        </CardContent>
      </Card>
    );
  }

  const chartConfig = buildChartConfig(data);
  const visibleItems = data.slice(0, MAX_LEGEND_ITEMS);
  const remainingCount = data.length - MAX_LEGEND_ITEMS;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Allocation</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-2 pb-4">
        <ChartContainer config={chartConfig} className="h-[120px] w-[120px]">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={30}
              outerRadius={45}
              strokeWidth={1}
            >
              {data.map((entry, index) => (
                <Cell key={entry.name} fill={FALLBACK_COLORS[index % FALLBACK_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>

        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs">
          {visibleItems.map((item, index) => (
            <div key={item.name} className="flex items-center gap-1">
              <span
                className="inline-block size-2 rounded-full"
                style={{
                  backgroundColor: FALLBACK_COLORS[index % FALLBACK_COLORS.length],
                }}
              />
              <span className="text-muted-foreground">{truncateName(item.name)}</span>
            </div>
          ))}
          {remainingCount > 0 && (
            <span className="text-muted-foreground">+{remainingCount} more</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
