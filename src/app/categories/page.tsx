export const dynamic = "force-dynamic";

import { requireOnboarding } from "@/lib/api/require-timezone";
import { getCategoryService, getReportService } from "@/lib/api/services";
import { CategoriesClient } from "@/components/categories/categories-client";
import { getCurrentMonth } from "@/lib/date-ranges";

export default function CategoriesPage(): React.ReactElement {
  requireOnboarding();
  const categoryService = getCategoryService();
  const reportService = getReportService();
  const categories = categoryService.getAll();
  const { items: stats } = reportService.getBudgetStats({
    month: getCurrentMonth(),
    type: "expense",
    includeZeroSpend: true,
    includeUncategorized: false,
  });

  return <CategoriesClient initialCategories={categories} initialStats={stats} />;
}
