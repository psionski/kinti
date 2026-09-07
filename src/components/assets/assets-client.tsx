"use client";

import { useState } from "react";
import { Plus, TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { PnlDisplay } from "@/components/shared/pnl-display";
import { EmptyState } from "@/components/shared/empty-state";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AssetFormDialog } from "./asset-form-dialog";
import { BuySellDialog } from "./buy-sell-dialog";
import { DepositWithdrawDialog } from "./deposit-withdraw-dialog";
import { RecordPriceDialog } from "./record-price-dialog";
import {
  formatCurrency,
  formatQuantity,
  formatUnitPrice,
  getBaseCurrency,
  holdingsUnit,
} from "@/lib/format";
import type { AssetWithMetrics, PortfolioResponse } from "@/lib/validators/assets";

interface AssetsClientProps {
  initialAssets: AssetWithMetrics[];
  portfolio: PortfolioResponse;
}

const TYPE_LABELS: Record<string, string> = {
  deposit: "Deposit",
  investment: "Investment",
  crypto: "Crypto",
  other: "Other",
};

/**
 * An asset card's stat table. Every card uses the same shape; which rows appear
 * depends on what the asset actually has to say.
 *
 * A deposit's unit price is 1, so its holdings line *is* its balance — a Price
 * row would read "1,00 €" forever and a Current value row would repeat the
 * number above it. A base-currency account therefore has one row, because it
 * has one fact. A foreign one has two more that are genuinely its own: what the
 * balance converts to today, and how much of that is the rate moving rather
 * than money arriving.
 *
 * Cost basis is deliberately absent everywhere. For a deposit it is the balance
 * again; for a position the P&L row already prices the gap against it, and the
 * detail page carries the figure itself. Dropping it brings a position's four
 * rows nearer a deposit's one without losing anything the card was saying.
 */
function AssetStats({ asset }: { asset: AssetWithMetrics }): React.ReactElement {
  const baseCurrency = getBaseCurrency();
  const isDeposit = asset.type === "deposit";
  const isForeign = asset.currency !== baseCurrency;

  return (
    <div className="space-y-1 text-sm">
      {/* A deposit's holdings line *is* its balance — the figure the card
          exists to show — so it takes the emphasis a position gets on its
          Current value row. A position's quantity is a share count rather than
          money, and stays muted under the value below it. */}
      <div className="flex justify-between gap-2">
        <span className="text-muted-foreground shrink-0">Holdings</span>
        <span
          className={`truncate text-right font-mono ${
            isDeposit ? "font-medium" : "text-muted-foreground"
          }`}
        >
          {formatQuantity(asset.currentHoldings)} {holdingsUnit(asset)}
        </span>
      </div>

      {!isDeposit && (
        <div className="text-muted-foreground flex justify-between">
          <span>Price</span>
          <span className="font-mono">
            {asset.latestPrice !== null ? formatUnitPrice(asset.latestPrice, asset.currency) : "—"}
            {asset.priceSource === "lot" && (
              <Popover>
                <PopoverTrigger asChild>
                  {/* A button, not a bare glyph: `title` is hover-only
                      and does nothing on touch. */}
                  <button
                    type="button"
                    aria-label="Why this price is an estimate"
                    className="px-1 py-0.5 text-amber-600 dark:text-amber-500"
                  >
                    *
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-56 text-xs" align="end">
                  Cost basis of the last trade — no market quote available.
                </PopoverContent>
              </Popover>
            )}
          </span>
        </div>
      )}

      {!isDeposit && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Current value</span>
          <span
            className="font-mono font-medium"
            title={
              asset.currentValueBase !== null
                ? `≈ ${formatCurrency(asset.currentValueBase)} (base)`
                : undefined
            }
          >
            {asset.currentValue !== null ? formatCurrency(asset.currentValue, asset.currency) : "—"}
          </span>
        </div>
      )}

      {/* A foreign account's balance is worth stating twice: in its own
          currency, and in the one everything else is counted in. The converted
          figure stays muted — native leads everywhere in this app (the detail
          page's `≈ base` line, a position row's base tooltip), so each card
          carries exactly one emphasised money figure. */}
      {isDeposit && isForeign && (
        <div className="text-muted-foreground flex justify-between">
          <span>In {baseCurrency}</span>
          <span className="font-mono">
            {asset.currentValueBase !== null ? formatCurrency(asset.currentValueBase) : "—"}
          </span>
        </div>
      )}

      {/* Every unit of a foreign account's P&L is the exchange rate moving, so
          the row is named for what it is rather than shown as a bare gain. A
          base-currency account has no such row: its P&L is always zero. */}
      {isDeposit ? (
        isForeign && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">FX</span>
            <PnlDisplay pnl={asset.pnlBase} size="sm" />
          </div>
        )
      ) : (
        <div className="flex justify-between">
          <span className="text-muted-foreground">P&amp;L</span>
          <PnlDisplay
            pnl={asset.pnlBase}
            size="sm"
            title={
              asset.pnl !== null
                ? `Native: ${asset.pnl >= 0 ? "+" : ""}${formatCurrency(asset.pnl, asset.currency)}`
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
}

function SummaryCards({ portfolio }: { portfolio: PortfolioResponse }): React.ReactElement {
  const { netWorth, cashBalance, totalAssetValue, pnl } = portfolio;
  // Sum the base-currency cost basis so cross-currency assets aggregate correctly.
  const totalInvested = portfolio.assets.reduce((s, a) => s + a.costBasisBase, 0);
  const pnlPct = totalInvested > 0 && pnl !== null ? (pnl / totalInvested) * 100 : null;

  return (
    <div data-tour="asset-summary" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-muted-foreground text-xs font-medium uppercase">
            Net Worth
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xl font-bold">{formatCurrency(netWorth)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-muted-foreground text-xs font-medium uppercase">
            Cash Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xl font-bold">{formatCurrency(cashBalance)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-muted-foreground text-xs font-medium uppercase">
            Total Invested
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xl font-bold">{formatCurrency(totalInvested)}</p>
          <p className="text-muted-foreground text-xs">Value: {formatCurrency(totalAssetValue)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-muted-foreground text-xs font-medium uppercase">
            Total P&amp;L
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pnl !== null ? (
            <>
              <p
                className={`flex items-center gap-1 text-xl font-bold ${pnl >= 0 ? "text-emerald-600" : "text-destructive"}`}
              >
                {pnl >= 0 ? <TrendingUp className="size-5" /> : <TrendingDown className="size-5" />}
                {pnl >= 0 ? "+" : ""}
                {formatCurrency(pnl)}
              </p>
              {pnlPct !== null && (
                <p className="text-muted-foreground text-xs">
                  {pnlPct >= 0 ? "+" : ""}
                  {pnlPct.toFixed(1)}%
                </p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground text-xl">—</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function AssetsClient({ initialAssets, portfolio }: AssetsClientProps): React.ReactElement {
  const [assets, setAssets] = useState(initialAssets);
  const [currentPortfolio, setCurrentPortfolio] = useState(portfolio);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [buyingAsset, setBuyingAsset] = useState<AssetWithMetrics | null>(null);
  const [sellingAsset, setSellingAsset] = useState<AssetWithMetrics | null>(null);
  const [depositingAsset, setDepositingAsset] = useState<AssetWithMetrics | null>(null);
  const [withdrawingAsset, setWithdrawingAsset] = useState<AssetWithMetrics | null>(null);
  const [pricingAsset, setPricingAsset] = useState<AssetWithMetrics | null>(null);

  async function refresh(): Promise<void> {
    setLoading(true);
    try {
      const [assetsRes, portfolioRes] = await Promise.all([
        fetch("/api/assets"),
        fetch("/api/portfolio"),
      ]);
      if (assetsRes.ok) setAssets((await assetsRes.json()) as AssetWithMetrics[]);
      if (portfolioRes.ok) setCurrentPortfolio((await portfolioRes.json()) as PortfolioResponse);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(data: {
    name: string;
    type: "deposit" | "investment" | "crypto" | "other";
    currency: string;
    icon?: string;
  }): Promise<void> {
    setLoading(true);
    try {
      await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      setShowCreate(false);
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleBuy(
    asset: AssetWithMetrics,
    data: { quantity: number; pricePerUnit: number; date: string; description?: string },
    closeDialog: () => void
  ): Promise<void> {
    setLoading(true);
    try {
      await fetch(`/api/assets/${asset.id}/buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      closeDialog();
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleSell(
    asset: AssetWithMetrics,
    data: { quantity: number; pricePerUnit: number; date: string; description?: string },
    closeDialog: () => void
  ): Promise<void> {
    setLoading(true);
    try {
      const res = await fetch(`/api/assets/${asset.id}/sell`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        alert(err.error);
        return;
      }
      closeDialog();
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleRecordPrice(
    asset: AssetWithMetrics,
    data: { pricePerUnit: number; recordedAt?: string }
  ): Promise<void> {
    setLoading(true);
    try {
      await fetch(`/api/assets/${asset.id}/prices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      setPricingAsset(null);
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`space-y-6 ${loading ? "pointer-events-none opacity-60" : ""}`}>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Assets</h1>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 size-4" />
          Add Asset
        </Button>
      </div>

      {assets.length === 0 ? (
        <EmptyState
          message="No assets yet."
          description="Add a savings account, investment, or crypto holding to track your net worth."
        />
      ) : (
        <>
          <SummaryCards portfolio={currentPortfolio} />

          <div
            data-tour="asset-cards"
            // Columns are sized by content, not viewport: a deposit's action
            // row needs ~272px, so a column never goes below 280px. The inner
            // `max` caps the grid at three columns by making each at least a
            // third of the row; the outer `min` keeps a single column from
            // overflowing a screen narrower than 280px.
            className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,max(280px,calc((100%_-_2rem)/3))),1fr))] gap-4"
          >
            {assets.map((asset) => (
              <Card key={asset.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        {asset.icon && <span className="text-lg">{asset.icon}</span>}
                        <CardTitle className="text-base">{asset.name}</CardTitle>
                      </div>
                      <Badge variant="secondary" className="mt-1 text-xs">
                        {TYPE_LABELS[asset.type] ?? asset.type}
                      </Badge>
                    </div>
                    <Link href={`/assets/${asset.id}`} data-testid={`asset-link-${asset.id}`}>
                      <Button variant="ghost" size="icon" className="size-7">
                        <ArrowRight className="size-4" />
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                {/* Cards in a row stretch to the tallest, but their content
                    does not — a deposit's table is shorter than a position's,
                    so without this its actions would float up mid-card. Grow
                    the content and push the action row down so every card's
                    buttons share a baseline. */}
                <CardContent className="flex grow flex-col gap-3">
                  <AssetStats asset={asset} />

                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    {asset.type === "deposit" ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => setDepositingAsset(asset)}
                        >
                          Deposit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => setWithdrawingAsset(asset)}
                        >
                          Withdraw
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => setBuyingAsset(asset)}
                        >
                          Buy
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => setSellingAsset(asset)}
                        >
                          Sell
                        </Button>
                      </>
                    )}
                    {/* A deposit's unit price is 1 by definition — the service
                        rejects a mark on one, so don't offer the button. */}
                    {asset.type !== "deposit" && (
                      <Button size="sm" variant="outline" onClick={() => setPricingAsset(asset)}>
                        Set Price
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {showCreate && (
        <AssetFormDialog
          open={showCreate}
          onOpenChange={setShowCreate}
          onSubmit={(data) => void handleCreate(data)}
          loading={loading}
        />
      )}

      {buyingAsset && (
        <BuySellDialog
          open={!!buyingAsset}
          onOpenChange={(o) => {
            if (!o) setBuyingAsset(null);
          }}
          mode="buy"
          asset={buyingAsset}
          onSubmit={(data) => void handleBuy(buyingAsset, data, () => setBuyingAsset(null))}
          loading={loading}
        />
      )}

      {sellingAsset && (
        <BuySellDialog
          open={!!sellingAsset}
          onOpenChange={(o) => {
            if (!o) setSellingAsset(null);
          }}
          mode="sell"
          asset={sellingAsset}
          onSubmit={(data) => void handleSell(sellingAsset, data, () => setSellingAsset(null))}
          loading={loading}
        />
      )}

      {depositingAsset && (
        <DepositWithdrawDialog
          open={!!depositingAsset}
          onOpenChange={(o) => {
            if (!o) setDepositingAsset(null);
          }}
          mode="deposit"
          asset={depositingAsset}
          onSubmit={(data) => void handleBuy(depositingAsset, data, () => setDepositingAsset(null))}
          loading={loading}
        />
      )}

      {withdrawingAsset && (
        <DepositWithdrawDialog
          open={!!withdrawingAsset}
          onOpenChange={(o) => {
            if (!o) setWithdrawingAsset(null);
          }}
          mode="withdraw"
          asset={withdrawingAsset}
          onSubmit={(data) =>
            void handleSell(withdrawingAsset, data, () => setWithdrawingAsset(null))
          }
          loading={loading}
        />
      )}

      {pricingAsset && (
        <RecordPriceDialog
          open={!!pricingAsset}
          onOpenChange={(o) => {
            if (!o) setPricingAsset(null);
          }}
          asset={pricingAsset}
          onSubmit={(data) => void handleRecordPrice(pricingAsset, data)}
          loading={loading}
        />
      )}
    </div>
  );
}
