import { TrendingDown, TrendingUp, Receipt, PieChart, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { BudgetStatusItem, SpendingSummaryResult } from "@/lib/validators/reports";
import type { CategoryWithCountResponse } from "@/lib/validators/categories";

interface KpiCardsProps {
  summary: SpendingSummaryResult;
  budgetStatus: BudgetStatusItem[];
  categories: Map<number, CategoryWithCountResponse>;
}

function DeltaBadge({
  current,
  previous,
}: {
  current: number;
  previous: number;
}): React.ReactElement | null {
  // Refunds can leave a period at or below zero, which no percentage change is relative to.
  if (previous <= 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const isUp = pct > 0;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${isUp ? "text-destructive" : "text-emerald-600"}`}
    >
      {isUp ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {formatPercent(Math.abs(pct))}
    </span>
  );
}

function getParentName(
  categoryId: number | null | undefined,
  categories: Map<number, CategoryWithCountResponse>
): string | null {
  if (categoryId == null) return null;
  const cat = categories.get(categoryId);
  if (!cat || cat.parentId === null) return null;
  const parent = categories.get(cat.parentId);
  return parent?.name ?? null;
}

export function KpiCards({ summary, budgetStatus, categories }: KpiCardsProps): React.ReactElement {
  const topCategory =
    summary.groups.length > 0 ? summary.groups.reduce((a, b) => (a.total > b.total ? a : b)) : null;

  const avgBudgetUsage =
    budgetStatus.length > 0
      ? budgetStatus.reduce((sum, b) => sum + b.percentUsed, 0) / budgetStatus.length
      : null;

  const budgetColor =
    avgBudgetUsage === null
      ? "text-muted-foreground"
      : avgBudgetUsage > 90
        ? "text-destructive"
        : avgBudgetUsage > 60
          ? "text-yellow-600"
          : "text-emerald-600";

  return (
    <div data-tour="kpi-cards" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Total Spend</CardTitle>
          <Receipt className="text-muted-foreground size-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold tabular-nums">
            {formatCurrency(summary.period.total)}
          </div>
          {summary.comparePeriod && (
            <div className="mt-1">
              <DeltaBadge current={summary.period.total} previous={summary.comparePeriod.total} />
              <span className="text-muted-foreground ml-1 text-xs">vs last month</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="hidden lg:block">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Transactions</CardTitle>
          <Receipt className="text-muted-foreground size-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold tabular-nums">{summary.period.count}</div>
          {summary.comparePeriod && (
            <p className="text-muted-foreground mt-1 text-xs">
              {summary.comparePeriod.count} last month
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="hidden lg:block">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Top Category</CardTitle>
          <PieChart className="text-muted-foreground size-4" />
        </CardHeader>
        <CardContent>
          {topCategory ? (
            <>
              <div className="flex text-2xl font-semibold">
                {(() => {
                  const parentName = getParentName(topCategory.categoryId, categories);
                  return parentName ? (
                    <span className="text-muted-foreground flex min-w-0 shrink items-baseline font-normal">
                      <span className="truncate">{parentName}</span>
                      <span className="shrink-0">&nbsp;›&nbsp;</span>
                    </span>
                  ) : null;
                })()}
                <span className="shrink-0">{topCategory.key}</span>
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                {formatCurrency(topCategory.total)}
              </p>
            </>
          ) : (
            <div className="text-muted-foreground text-sm">No data</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Budget Utilization</CardTitle>
          <Target className="text-muted-foreground size-4" />
        </CardHeader>
        <CardContent>
          {avgBudgetUsage !== null ? (
            <>
              <div className={`text-2xl font-semibold tabular-nums ${budgetColor}`}>
                {formatPercent(avgBudgetUsage)}
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                across {budgetStatus.length} budget{budgetStatus.length !== 1 ? "s" : ""}
              </p>
            </>
          ) : (
            <div className="text-muted-foreground text-sm">No budgets set</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
