export const dynamic = "force-dynamic";

import { requireOnboarding } from "@/lib/api/require-timezone";
import { getRecurringService, getCategoryService } from "@/lib/api/services";
import { RecurringClient } from "@/components/recurring/recurring-client";

export default function RecurringPage(): React.ReactElement {
  requireOnboarding();
  const recurring = getRecurringService().list();
  const categories = getCategoryService().getAll();

  return <RecurringClient initialRecurring={recurring} initialCategories={categories} />;
}
