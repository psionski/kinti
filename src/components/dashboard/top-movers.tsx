import Link from "next/link";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/format";
import type { AssetWithMetrics } from "@/lib/validators/assets";

interface TopMoversProps {
  assets: AssetWithMetrics[];
}

export function TopMovers({ assets }: TopMoversProps): React.ReactElement {
  // Rank by base-currency P&L so multi-currency portfolios compare apples-to-apples.
  const movers = assets
    .filter((a): a is AssetWithMetrics & { pnlBase: number } => a.pnlBase !== null)
    .sort((a, b) => Math.abs(b.pnlBase) - Math.abs(a.pnlBase))
    .slice(0, 3);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Top Movers</CardTitle>
      </CardHeader>
      <CardContent>
        {movers.length === 0 ? (
          <EmptyState message="No P&L data yet." />
        ) : (
          <div className="space-y-3">
            {movers.map((asset) => {
              const positive = asset.pnlBase >= 0;
              return (
                <div key={asset.id} className="flex items-center justify-between text-sm">
                  <Link
                    href={`/assets/${asset.id}`}
                    className="flex items-center gap-2 hover:underline"
                  >
                    {asset.icon && <span>{asset.icon}</span>}
                    <span className="font-medium">{asset.name}</span>
                  </Link>
                  <span
                    className={`flex items-center gap-1 font-mono font-medium ${positive ? "text-emerald-600" : "text-destructive"}`}
                  >
                    {positive ? (
                      <TrendingUp className="size-3.5" />
                    ) : (
                      <TrendingDown className="size-3.5" />
                    )}
                    {positive ? "+" : ""}
                    {formatCurrency(asset.pnlBase)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
