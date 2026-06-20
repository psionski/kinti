export const dynamic = "force-dynamic";

import { requireOnboarding } from "@/lib/api/require-timezone";
import { getBudgetService, getCategoryService } from "@/lib/api/services";
import { getCurrentMonth } from "@/lib/date-ranges";
import { BudgetsClient } from "@/components/budgets/budgets-client";

export default function BudgetsPage(): React.ReactElement {
  requireOnboarding();
  const currentMonth = getCurrentMonth();
  const { items: budgetStatus, inheritedFrom } = getBudgetService().getForMonth({
    month: currentMonth,
  });
  const categories = getCategoryService().getAll();

  return (
    <BudgetsClient
      initialBudgetStatus={budgetStatus}
      initialInheritedFrom={inheritedFrom}
      initialCategories={categories}
      currentMonth={currentMonth}
    />
  );
}
