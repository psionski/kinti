export const dynamic = "force-dynamic";

import { requireOnboarding } from "@/lib/api/require-timezone";
import { getAssetService, getPortfolioService } from "@/lib/api/services";
import { AssetsClient } from "@/components/assets/assets-client";

export default function AssetsPage(): React.ReactElement {
  requireOnboarding();
  const assets = getAssetService().list();
  const portfolio = getPortfolioService().getPortfolio();

  return <AssetsClient initialAssets={assets} portfolio={portfolio} />;
}
