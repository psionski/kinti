import { HydrationBoundary } from "@tanstack/react-query";
import { requireOnboarding } from "@/lib/api/require-timezone";
import { notFound } from "next/navigation";
import { getAssetService, getAssetLotService, getPortfolioReportService } from "@/lib/api/services";
import { AssetDetailClient } from "@/components/assets/asset-detail-client";
import { seedQueries } from "@/lib/queries/seed";
import { assetLotsQuery, assetQuery } from "@/lib/queries/assets";
import { realizedPnlQuery, type RealizedPnlParams } from "@/lib/queries/portfolio";
import { RealizedPnlQuerySchema } from "@/lib/validators/portfolio-reports";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AssetDetailPage({ params }: PageProps): Promise<React.ReactElement> {
  requireOnboarding();
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const asset = getAssetService().getById(id);
  if (!asset) notFound();

  // Every sale to date; the client picks out this asset's row.
  const realizedParams: RealizedPnlParams = {};

  const state = seedQueries((client) => {
    client.setQueryData(assetQuery(id).queryKey, asset);
    client.setQueryData(assetLotsQuery(id).queryKey, getAssetLotService().listLots(id));
    const realized = RealizedPnlQuerySchema.parse(realizedParams);
    client.setQueryData(
      realizedPnlQuery(realizedParams).queryKey,
      getPortfolioReportService().getRealizedPnL(realized.from, realized.to)
    );
  });

  return (
    <HydrationBoundary state={state}>
      <AssetDetailClient assetId={id} />
    </HydrationBoundary>
  );
}
