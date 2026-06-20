"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MoreHorizontal, Pencil, Trash2, AlertTriangle, X } from "lucide-react";
import { PnlDisplay } from "@/components/shared/pnl-display";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AssetFormDialog } from "./asset-form-dialog";
import { BuySellDialog } from "./buy-sell-dialog";
import { DepositWithdrawDialog } from "./deposit-withdraw-dialog";
import { RecordPriceDialog } from "./record-price-dialog";
import { SymbolSearchDialog } from "./symbol-search";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { AssetDetailCharts } from "./asset-detail-charts";
import { LotHistoryTable } from "./lot-history-table";
import { formatCurrency, formatPrice, getBaseCurrency } from "@/lib/format";
import { PROVIDER_LABELS } from "@/lib/providers/labels";
import type { AssetWithMetrics, AssetLotResponse, SymbolMap } from "@/lib/validators/assets";

interface AssetDetailClientProps {
  initialAsset: AssetWithMetrics;
  initialLots: AssetLotResponse[];
  realizedPnl: number | null;
}

export function AssetDetailClient({
  initialAsset,
  initialLots,
  realizedPnl: initialRealizedPnl,
}: AssetDetailClientProps): React.ReactElement {
  const router = useRouter();
  const [asset, setAsset] = useState(initialAsset);
  const [lots, setLots] = useState(initialLots);
  const [realizedPnl] = useState(initialRealizedPnl);
  const [loading, setLoading] = useState(false);

  // Dialog states
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showBuy, setShowBuy] = useState(false);
  const [showSell, setShowSell] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showPrice, setShowPrice] = useState(false);
  const [showTracking, setShowTracking] = useState(false);

  const unrealizedPnl =
    asset.pnl !== null && realizedPnl !== null ? asset.pnl - realizedPnl : asset.pnl;

  // Realized P&L is recorded against transfer transactions whose amount is in
  // the asset's native currency, so the unrealized derivation works in native
  // units. The base-currency PnlDisplay below uses pnlBase directly.

  // Pure base-currency deposits don't need an FX feed; everything else (foreign
  // deposit, investment, crypto) benefits from external price/exchange-rate
  // tracking via the symbol map.
  const showTrackingSection = asset.type !== "deposit" || asset.currency !== getBaseCurrency();

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const [assetRes, lotsRes] = await Promise.all([
        fetch(`/api/assets/${asset.id}`),
        fetch(`/api/assets/${asset.id}/lots`),
      ]);
      if (assetRes.ok) setAsset((await assetRes.json()) as AssetWithMetrics);
      if (lotsRes.ok) setLots((await lotsRes.json()) as AssetLotResponse[]);
    } finally {
      setLoading(false);
    }
  }, [asset.id]);

  async function handleEdit(data: {
    name: string;
    type: "deposit" | "investment" | "crypto" | "other";
    currency: string;
    symbolMap?: SymbolMap;
    icon?: string;
  }): Promise<void> {
    setLoading(true);
    try {
      await fetch(`/api/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      setShowEdit(false);
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(): Promise<void> {
    setLoading(true);
    try {
      const res = await fetch(`/api/assets/${asset.id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/assets");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateTracking(sm: SymbolMap): Promise<void> {
    setLoading(true);
    try {
      const hasSymbols = Object.keys(sm).length > 0;
      await fetch(`/api/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbolMap: hasSymbols ? sm : null }),
      });
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleBuySell(
    data: { quantity: number; pricePerUnit: number; date: string; description?: string },
    mode: "buy" | "sell",
    closeDialog: () => void
  ): Promise<void> {
    setLoading(true);
    try {
      const endpoint = mode === "buy" ? "buy" : "sell";
      const res = await fetch(`/api/assets/${asset.id}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok && mode === "sell") {
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

  async function handleRecordPrice(data: {
    pricePerUnit: number;
    recordedAt?: string;
  }): Promise<void> {
    setLoading(true);
    try {
      await fetch(`/api/assets/${asset.id}/prices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      setShowPrice(false);
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`space-y-6 ${loading ? "pointer-events-none opacity-60" : ""}`}>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/assets" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              {asset.icon && <span className="text-2xl">{asset.icon}</span>}
              <h1 className="text-3xl font-bold tracking-tight">{asset.name}</h1>
            </div>
            <Badge variant="secondary" className="mt-1">
              {asset.type}
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {asset.type === "deposit" ? (
            <>
              <Button size="sm" variant="outline" onClick={() => setShowDeposit(true)}>
                Deposit
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowWithdraw(true)}>
                Withdraw
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => setShowBuy(true)}>
                Buy
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowSell(true)}>
                Sell
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" onClick={() => setShowPrice(true)}>
            Set Price
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowEdit(true)}>
                <Pencil className="mr-2 size-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={() => setShowDelete(true)}>
                <Trash2 className="mr-2 size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-muted-foreground text-xs font-medium uppercase">
              Holdings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-xl font-bold">
              {asset.currentHoldings}{" "}
              <span className="text-muted-foreground text-sm font-normal">{asset.currency}</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-muted-foreground text-xs font-medium uppercase">
              Cost Basis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{formatCurrency(asset.costBasis, asset.currency)}</p>
            {asset.costBasisBase !== asset.costBasis && (
              <p className="text-muted-foreground mt-0.5 text-xs">
                ≈ {formatCurrency(asset.costBasisBase)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-muted-foreground text-xs font-medium uppercase">
              Current Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">
              {asset.currentValue !== null
                ? formatCurrency(asset.currentValue, asset.currency)
                : "—"}
            </p>
            {asset.currentValueBase !== null && asset.currentValueBase !== asset.currentValue && (
              <p className="text-muted-foreground mt-0.5 text-xs">
                ≈ {formatCurrency(asset.currentValueBase)}
              </p>
            )}
            {asset.latestPrice !== null && (
              <p className="text-muted-foreground mt-0.5 text-xs">
                @ {formatPrice(asset.latestPrice)} {asset.currency}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-muted-foreground text-xs font-medium uppercase">
              P&amp;L
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-xl font-bold">
              <PnlDisplay
                pnl={asset.pnl}
                title={
                  asset.pnlBase !== null && asset.pnlBase !== asset.pnl
                    ? `≈ ${asset.pnlBase >= 0 ? "+" : ""}${formatCurrency(asset.pnlBase)} (base)`
                    : undefined
                }
              />
            </p>
            <div className="space-y-0.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground text-xs">Unrealized</span>
                <PnlDisplay pnl={unrealizedPnl} />
              </div>
              {realizedPnl !== null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-xs">Realized</span>
                  <PnlDisplay pnl={realizedPnl} />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Price Tracking */}
      {showTrackingSection && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">
              {asset.type === "deposit" ? "Exchange Rate Tracking" : "Price Tracking"}
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => setShowTracking(true)}>
              {asset.symbolMap && Object.keys(asset.symbolMap).length > 0
                ? "Change"
                : "Set up tracking"}
            </Button>
          </CardHeader>
          <CardContent>
            {asset.symbolMap && Object.keys(asset.symbolMap).length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(asset.symbolMap).map(([provider, symbol]) => (
                  <Badge key={provider} variant="secondary" className="gap-1">
                    <span className="text-muted-foreground">
                      {PROVIDER_LABELS[provider as keyof typeof PROVIDER_LABELS] ?? provider}:
                    </span>
                    {symbol}
                    <button
                      type="button"
                      className="hover:text-destructive relative ml-0.5 after:absolute after:-inset-2"
                      disabled={loading}
                      onClick={() => {
                        const next = { ...asset.symbolMap } as SymbolMap;
                        delete next[provider as keyof SymbolMap];
                        const hasSymbols = Object.keys(next).length > 0;
                        void handleUpdateTracking(hasSymbols ? next : {});
                      }}
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                No automatic {asset.type === "deposit" ? "exchange rate" : "price"} tracking
                configured.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      <AssetDetailCharts assetId={asset.id} currency={asset.currency} />

      {/* Lot history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          <LotHistoryTable lots={lots} currency={asset.currency} assetType={asset.type} />
        </CardContent>
      </Card>

      {/* Dialogs */}
      {showEdit && (
        <AssetFormDialog
          open={showEdit}
          onOpenChange={setShowEdit}
          onSubmit={handleEdit}
          initialData={asset}
          loading={loading}
        />
      )}

      {showDelete && (
        <ConfirmDeleteDialog
          open={showDelete}
          onOpenChange={setShowDelete}
          title="Delete Asset"
          description={`Are you sure you want to delete "${asset.name}"?`}
          onConfirm={() => void handleDelete()}
          loading={loading}
        >
          {asset.currentHoldings > 0 && (
            <p className="flex items-start gap-2 text-sm text-amber-600">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                This asset still has{" "}
                <strong>
                  {asset.currentHoldings} {asset.currency}
                </strong>{" "}
                in holdings
                {asset.currentValue !== null && (
                  <> (valued at {formatCurrency(asset.currentValue, asset.currency)})</>
                )}
                .
              </span>
            </p>
          )}
          <p className="text-muted-foreground text-sm">
            This will remove all lots and price history. Past transactions will be preserved.
          </p>
        </ConfirmDeleteDialog>
      )}

      <SymbolSearchDialog
        open={showTracking}
        onOpenChange={setShowTracking}
        value={asset.symbolMap ? { ...asset.symbolMap } : {}}
        onDone={(sm) => void handleUpdateTracking(sm)}
        assetType={asset.type}
      />

      {showBuy && (
        <BuySellDialog
          open={showBuy}
          onOpenChange={(o) => {
            if (!o) setShowBuy(false);
          }}
          mode="buy"
          asset={asset}
          onSubmit={(data) => void handleBuySell(data, "buy", () => setShowBuy(false))}
          loading={loading}
        />
      )}

      {showSell && (
        <BuySellDialog
          open={showSell}
          onOpenChange={(o) => {
            if (!o) setShowSell(false);
          }}
          mode="sell"
          asset={asset}
          onSubmit={(data) => void handleBuySell(data, "sell", () => setShowSell(false))}
          loading={loading}
        />
      )}

      {showDeposit && (
        <DepositWithdrawDialog
          open={showDeposit}
          onOpenChange={(o) => {
            if (!o) setShowDeposit(false);
          }}
          mode="deposit"
          asset={asset}
          onSubmit={(data) => void handleBuySell(data, "buy", () => setShowDeposit(false))}
          loading={loading}
        />
      )}

      {showWithdraw && (
        <DepositWithdrawDialog
          open={showWithdraw}
          onOpenChange={(o) => {
            if (!o) setShowWithdraw(false);
          }}
          mode="withdraw"
          asset={asset}
          onSubmit={(data) => void handleBuySell(data, "sell", () => setShowWithdraw(false))}
          loading={loading}
        />
      )}

      {showPrice && (
        <RecordPriceDialog
          open={showPrice}
          onOpenChange={(o) => {
            if (!o) setShowPrice(false);
          }}
          asset={asset}
          onSubmit={(data) => void handleRecordPrice(data)}
          loading={loading}
        />
      )}
    </div>
  );
}
