export const dynamic = "force-dynamic";

import { HydrationBoundary } from "@tanstack/react-query";
import { requireOnboarding } from "@/lib/api/require-timezone";
import { getAssetService, getPortfolioService } from "@/lib/api/services";
import { AssetsClient } from "@/components/assets/assets-client";
import { seedQueries } from "@/lib/queries/seed";
import { assetListQuery } from "@/lib/queries/assets";
import { portfolioQuery } from "@/lib/queries/portfolio";

export default function AssetsPage(): React.ReactElement {
  requireOnboarding();

  const state = seedQueries((client) => {
    client.setQueryData(assetListQuery().queryKey, getAssetService().list());
    client.setQueryData(portfolioQuery().queryKey, getPortfolioService().getPortfolio());
  });

  return (
    <HydrationBoundary state={state}>
      <AssetsClient />
    </HydrationBoundary>
  );
}
