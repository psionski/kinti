"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { TransferSummaryItem } from "@/lib/validators/portfolio-reports";

const chartConfig = {
  purchases: {
    label: "Purchases",
    color: "var(--chart-1)",
  },
  sales: {
    label: "Sales",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

interface TransferFlowProps {
  data: TransferSummaryItem[];
}

export function TransferFlow({ data }: TransferFlowProps): React.ReactElement {
  const chartData = data.map((item) => ({
    name: item.assetName,
    purchases: item.purchases,
    sales: item.sales,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transfer Flow</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length > 0 ? (
          <ChartContainer config={chartConfig} className="min-h-[250px] w-full">
            <BarChart data={chartData} layout="horizontal" accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) => formatCurrency(value)}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent formatter={(value) => formatCurrency(value as number)} />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="purchases" fill="var(--color-purchases)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="sales" fill="var(--color-sales)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        ) : (
          <p className="text-muted-foreground py-10 text-center text-sm">No transfer data yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
