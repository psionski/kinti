import { requireOnboarding } from "@/lib/api/require-timezone";
import { notFound } from "next/navigation";
import { getAssetService, getAssetLotService, getPortfolioReportService } from "@/lib/api/services";
import { AssetDetailClient } from "@/components/assets/asset-detail-client";

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

  const lots = getAssetLotService().listLots(id);

  const reportService = getPortfolioReportService();
  const realizedPnlResult = reportService.getRealizedPnL();
  const assetRealizedPnl = realizedPnlResult.items.find((item) => item.assetId === id);
  const realizedPnl = assetRealizedPnl?.realizedPnl ?? null;

  return <AssetDetailClient initialAsset={asset} initialLots={lots} realizedPnl={realizedPnl} />;
}
