export const dynamic = "force-dynamic";

import { HydrationBoundary } from "@tanstack/react-query";
import { requireOnboarding } from "@/lib/api/require-timezone";
import { getTransactionService, getCategoryService } from "@/lib/api/services";
import { TransactionsClient } from "@/components/transactions/transactions-client";
import { initialPageQuery, toListParams } from "@/components/transactions/transaction-query";
import { seedQueries } from "@/lib/queries/seed";
import { transactionListQuery } from "@/lib/queries/transactions";
import { categoryListQuery } from "@/lib/queries/categories";
import { ListTransactionsSchema } from "@/lib/validators/transactions";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TransactionsPage({
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  requireOnboarding();
  const search = await searchParams;
  const params = toListParams(
    initialPageQuery((key) => {
      const value = search[key];
      return (Array.isArray(value) ? value[0] : value) ?? null;
    })
  );

  const state = seedQueries((client) => {
    // A preset the API would reject isn't seeded; the client's own fetch
    // reports it instead.
    const input = ListTransactionsSchema.safeParse(params);
    if (input.success) {
      client.setQueryData(
        transactionListQuery(params).queryKey,
        getTransactionService().list(input.data)
      );
    }
    client.setQueryData(categoryListQuery().queryKey, getCategoryService().getAll());
  });

  return (
    <HydrationBoundary state={state}>
      <TransactionsClient />
    </HydrationBoundary>
  );
}
