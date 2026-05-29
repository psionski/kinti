"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/format";
import type { CurrencyExposureItem } from "@/lib/validators/portfolio-reports";

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

interface CurrencyExposureProps {
  data: CurrencyExposureItem[];
}

export function CurrencyExposure({ data }: CurrencyExposureProps): React.ReactElement {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Currency Exposure</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState message="No currency exposure data available." />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Currency Exposure</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Horizontal stacked bar */}
        <div className="flex h-6 overflow-hidden rounded-md">
          {data.map((item, i) => (
            <div
              key={item.currency}
              style={{
                width: `${item.pct}%`,
                backgroundColor: COLORS[i % COLORS.length],
              }}
              title={`${item.currency}: ${item.pct.toFixed(1)}%`}
            />
          ))}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {data.map((item, i) => (
            <div key={item.currency} className="flex items-center gap-1.5 text-sm">
              <span
                className="inline-block size-3 rounded-sm"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <span className="font-medium">{item.currency}</span>
              <span className="text-muted-foreground">
                {item.pct.toFixed(1)}% &middot; {formatCurrency(item.value)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
