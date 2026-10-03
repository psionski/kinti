export const dynamic = "force-dynamic";

import { HydrationBoundary } from "@tanstack/react-query";
import { requireOnboarding } from "@/lib/api/require-timezone";
import { getCategoryService, getReportService } from "@/lib/api/services";
import { CategoriesClient } from "@/components/categories/categories-client";
import { getCurrentMonth } from "@/lib/date-ranges";
import { seedQueries } from "@/lib/queries/seed";
import { budgetStatsQuery, type BudgetStatsParams } from "@/lib/queries/budgets";
import { categoryListQuery } from "@/lib/queries/categories";
import { BudgetStatsSchema } from "@/lib/validators/reports";

export default function CategoriesPage(): React.ReactElement {
  requireOnboarding();
  const month = getCurrentMonth();
  const statsParams: BudgetStatsParams = { month };

  const state = seedQueries((client) => {
    client.setQueryData(categoryListQuery().queryKey, getCategoryService().getAll());
    client.setQueryData(
      budgetStatsQuery(statsParams).queryKey,
      getReportService().getBudgetStats(BudgetStatsSchema.parse(statsParams))
    );
  });

  return (
    <HydrationBoundary state={state}>
      <CategoriesClient month={month} />
    </HydrationBoundary>
  );
}
