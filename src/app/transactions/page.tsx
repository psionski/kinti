export const dynamic = "force-dynamic";

import { requireOnboarding } from "@/lib/api/require-timezone";
import { getTransactionService, getCategoryService } from "@/lib/api/services";
import { TransactionsClient } from "@/components/transactions/transactions-client";

export default function TransactionsPage(): React.ReactElement {
  requireOnboarding();
  const transactionService = getTransactionService();
  const categoryService = getCategoryService();

  const initialData = transactionService.list({
    limit: 50,
    offset: 0,
    sortBy: "date",
    sortOrder: "desc",
  });

  const categories = categoryService.getAll();

  return <TransactionsClient initialData={initialData} categories={categories} />;
}
