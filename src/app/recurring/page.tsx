export const dynamic = "force-dynamic";

import { HydrationBoundary } from "@tanstack/react-query";
import { requireOnboarding } from "@/lib/api/require-timezone";
import { getRecurringService, getCategoryService } from "@/lib/api/services";
import { RecurringClient } from "@/components/recurring/recurring-client";
import { seedQueries } from "@/lib/queries/seed";
import { recurringListQuery } from "@/lib/queries/recurring";
import { categoryListQuery } from "@/lib/queries/categories";

export default function RecurringPage(): React.ReactElement {
  requireOnboarding();

  const state = seedQueries((client) => {
    client.setQueryData(recurringListQuery().queryKey, getRecurringService().list());
    client.setQueryData(categoryListQuery().queryKey, getCategoryService().getAll());
  });

  return (
    <HydrationBoundary state={state}>
      <RecurringClient />
    </HydrationBoundary>
  );
}
