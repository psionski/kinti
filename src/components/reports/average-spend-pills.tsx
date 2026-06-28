"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { SpendingGroup } from "@/lib/validators/reports";
import type { CategoryWithCountResponse } from "@/lib/validators/categories";

interface AverageSpendPillsProps {
  groups: SpendingGroup[];
  months: number;
  categories: CategoryWithCountResponse[];
}

export function AverageSpendPills({
  groups,
  months,
  categories,
}: AverageSpendPillsProps): React.ReactElement {
  const iconById = new Map(categories.map((c) => [c.id, c.icon]));

  const pills = groups
    .filter((g) => g.total > 0)
    .map((g) => ({
      key: g.key,
      icon: g.categoryId != null ? (iconById.get(g.categoryId) ?? null) : null,
      average: g.total / Math.max(months, 1),
    }))
    .sort((a, b) => b.average - a.average);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle>Average Spend by Category</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {pills.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {pills.map((p) => (
              <span
                key={p.key}
                className="bg-muted inline-block rounded-full px-2.5 py-1 text-sm whitespace-nowrap"
              >
                {p.icon ? `${p.icon} ` : ""}
                {p.key}: {formatCurrency(p.average)}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground py-10 text-center text-sm">
            No spending data for this period.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
