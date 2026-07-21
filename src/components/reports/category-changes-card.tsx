"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { SpendingGroup } from "@/lib/validators/reports";

interface CategoryChangesCardProps {
  groups: SpendingGroup[];
}

interface ChangeRow {
  name: string;
  current: number;
  previous: number;
  delta: number;
  deltaPercent: number;
}

export function CategoryChangesCard({ groups }: CategoryChangesCardProps): React.ReactElement {
  const changes: ChangeRow[] = groups
    .filter((g) => g.compareTotal !== undefined)
    .map((g) => {
      const current = g.total;
      const previous = g.compareTotal!;
      const delta = current - previous;
      const deltaPercent = previous > 0 ? (delta / previous) * 100 : current > 0 ? 100 : 0;
      return {
        name: g.key,
        current,
        previous,
        delta,
        deltaPercent: Math.round(deltaPercent * 10) / 10,
      };
    })
    .filter((r) => Math.abs(r.delta) > 100) // filter out changes < €1
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spending Changes vs Previous Period</CardTitle>
      </CardHeader>
      <CardContent>
        {changes.length > 0 ? (
          <div className="space-y-2">
            {changes.map((row) => (
              <div
                key={row.name}
                className="flex flex-col gap-1 rounded-md border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-2">
                  {row.delta > 0 ? (
                    <TrendingUp className="size-4 text-red-500" />
                  ) : row.delta < 0 ? (
                    <TrendingDown className="size-4 text-green-500" />
                  ) : (
                    <Minus className="text-muted-foreground size-4" />
                  )}
                  <span className="text-sm font-medium">{row.name}</span>
                </div>

                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">
                    {formatCurrency(row.previous)} &rarr; {formatCurrency(row.current)}
                  </span>
                  <span
                    className={`min-w-[80px] text-right font-medium ${
                      row.delta > 0 ? "text-red-500" : row.delta < 0 ? "text-green-500" : ""
                    }`}
                  >
                    {row.delta > 0 ? "+" : ""}
                    {formatCurrency(row.delta)} ({row.delta > 0 ? "+" : ""}
                    {row.deltaPercent}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground py-10 text-center text-sm">
            No significant changes between periods.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
