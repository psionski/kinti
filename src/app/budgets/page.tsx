export const dynamic = "force-dynamic";

import { HydrationBoundary } from "@tanstack/react-query";
import { requireOnboarding } from "@/lib/api/require-timezone";
import { getBudgetService, getCategoryService } from "@/lib/api/services";
import { getCurrentMonth } from "@/lib/date-ranges";
import { BudgetsClient } from "@/components/budgets/budgets-client";
import { seedQueries } from "@/lib/queries/seed";
import { budgetStatusQuery, type BudgetStatusParams } from "@/lib/queries/budgets";
import { categoryListQuery } from "@/lib/queries/categories";
import { GetBudgetStatusSchema } from "@/lib/validators/budgets";

export default function BudgetsPage(): React.ReactElement {
  requireOnboarding();
  const currentMonth = getCurrentMonth();
  const params: BudgetStatusParams = { month: currentMonth };

  const state = seedQueries((client) => {
    client.setQueryData(
      budgetStatusQuery(params).queryKey,
      getBudgetService().getForMonth(GetBudgetStatusSchema.parse(params))
    );
    client.setQueryData(categoryListQuery().queryKey, getCategoryService().getAll());
  });

  return (
    <HydrationBoundary state={state}>
      <BudgetsClient currentMonth={currentMonth} />
    </HydrationBoundary>
  );
}
