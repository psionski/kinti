"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, MoreHorizontal, Pencil, Trash2, AlertTriangle, X } from "lucide-react";
import { PnlDisplay } from "@/components/shared/pnl-display";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import {
  formatCurrency,
  formatQuantity,
  formatUnitPrice,
  getBaseCurrency,
  holdingsUnit,
} from "@/lib/format";
import { PROVIDER_LABELS } from "@/lib/providers/labels";
import {
  assetLotsQuery,
  assetQuery,
  useBuyAsset,
  useDeleteAsset,
  useRecordAssetPrice,
  useSellAsset,
  useUpdateAsset,
} from "@/lib/queries/assets";
import { realizedPnlQuery } from "@/lib/queries/portfolio";
import type { AssetWithMetrics, SymbolMap } from "@/lib/validators/assets";
import { resetOnClose } from "@/components/shared/reset-on-close";

interface AssetDetailClientProps {
  assetId: number;
}

interface LotFormData {
  quantity: number;
  pricePerUnit: number;
  date: string;
  description?: string;
}

export function AssetDetailClient({ assetId }: AssetDetailClientProps): React.ReactElement {
  const router = useRouter();
  const assetResult = useQuery(assetQuery(assetId));
  const lots = useQuery(assetLotsQuery(assetId)).data ?? [];
  // Realized P&L is reported for every asset at once; this page needs one row.
  const realized = useQuery(realizedPnlQuery({})).data?.items.find(
    (item) => item.assetId === assetId
  );
  // Both denominations travel: the P&L card reports in base (so it agrees with
  // the asset list and with every portfolio total), and keeps the native figure
  // for the tooltip.
  const realizedPnl = realized?.realizedPnl ?? null;
  const realizedPnlBase = realized?.realizedPnlBase ?? null;

  // Dialog states
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showBuy, setShowBuy] = useState(false);
  const [showSell, setShowSell] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showPrice, setShowPrice] = useState(false);
  const [showTracking, setShowTracking] = useState(false);

  const updateAsset = useUpdateAsset();
  // Tracking changes come from the card's own controls, so they fail there
  // rather than in the edit dialog.
  const updateTracking = useUpdateAsset();
  const deleteAsset = useDeleteAsset();
  // A deposit is a buy at 1 per unit and a withdrawal a sell, so each pair of
  // dialogs shares the endpoint's mutation; only one dialog is open at a time.
  const buyAsset = useBuyAsset();
  const sellAsset = useSellAsset();
  const recordPrice = useRecordAssetPrice();

  // A refetch that fails keeps the asset it last read — including the one
  // that follows deleting it, while the page navigates away.
  const asset = assetResult.data;
  if (!asset) {
    return assetResult.isError ? (
      <p className="text-destructive text-sm">
        Couldn&apos;t load asset: {assetResult.error.message}
      </p>
    ) : (
      <p className="text-muted-foreground text-sm">Loading…</p>
    );
  }

  // `PnlDisplay` formats in the base currency, so everything handed to it must
  // already be in base — a native figure there renders a dollar amount under a
  // euro sign. Base is also the denomination that makes the card agree with the
  // asset list and with every portfolio total, and it is the only one that says
  // anything at all about a foreign deposit, whose native P&L is always 0.
  const unrealizedPnlBase =
    asset.pnlBase !== null && realizedPnlBase !== null
      ? asset.pnlBase - realizedPnlBase
      : asset.pnlBase;

  /** The same figure in the asset's own currency, for the tooltips. */
  const nativeHint = (native: number | null, base: number | null): string | undefined => {
    if (native === null || base === null || native === base) return undefined;
    return `${native >= 0 ? "+" : ""}${formatCurrency(native, asset.currency)} in ${asset.currency}`;
  };

  const unrealizedPnl =
    asset.pnl !== null && realizedPnl !== null ? asset.pnl - realizedPnl : asset.pnl;

  // Pure base-currency deposits don't need an FX feed; everything else (foreign
  // deposit, investment, crypto) benefits from external price/exchange-rate
  // tracking via the symbol map.
  const showTrackingSection = asset.type !== "deposit" || asset.currency !== getBaseCurrency();

  function handleEdit(data: {
    name: string;
    type: "deposit" | "investment" | "crypto" | "other";
    currency: string;
    symbolMap?: SymbolMap;
    icon?: string;
  }): void {
    updateAsset.mutate({ id: assetId, ...data }, { onSuccess: () => setShowEdit(false) });
  }

  function handleDelete(): void {
    deleteAsset.mutate(assetId, { onSuccess: () => router.push("/assets") });
  }

  function handleUpdateTracking(sm: SymbolMap): void {
    const hasSymbols = Object.keys(sm).length > 0;
    updateTracking.mutate({ id: assetId, symbolMap: hasSymbols ? sm : null });
  }

  function handleBuy(data: LotFormData, close: () => void): void {
    buyAsset.mutate({ id: assetId, ...data }, { onSuccess: close });
  }

  function handleSell(data: LotFormData, close: () => void): void {
    sellAsset.mutate({ id: assetId, ...data }, { onSuccess: close });
  }

  function handleRecordPrice(data: { pricePerUnit: number; recordedAt?: string }): void {
    recordPrice.mutate({ id: assetId, ...data }, { onSuccess: () => setShowPrice(false) });
  }

  return (
    <div className="space-y-6">
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
          {/* A deposit's unit price is 1 by definition, so a mark on it would be
              rejected by the service and could never be read back anyway. */}
          {asset.type !== "deposit" && (
            <Button size="sm" variant="outline" onClick={() => setShowPrice(true)}>
              Set Price
            </Button>
          )}
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
        <Card data-testid="metric-holdings">
          <CardHeader className="pb-1">
            <CardTitle className="text-muted-foreground text-xs font-medium uppercase">
              Holdings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-xl font-bold">
              {formatQuantity(asset.currentHoldings)}{" "}
              <span className="text-muted-foreground text-sm font-normal">
                {holdingsUnit(asset)}
              </span>
            </p>
          </CardContent>
        </Card>
        <Card data-testid="metric-cost-basis">
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
        <Card data-testid="metric-current-value">
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
            {/* "@ 1,00 $" restates the deposit invariant and nothing else; the
                ≈ base line above already shows what the balance is worth. */}
            {asset.latestPrice !== null && asset.type !== "deposit" && (
              <p className="text-muted-foreground mt-0.5 text-xs">
                @ {formatUnitPrice(asset.latestPrice, asset.currency)}
                <PriceProvenance source={asset.priceSource} asOf={asset.priceAsOf} />
              </p>
            )}
          </CardContent>
        </Card>
        <Card data-testid="metric-pnl">
          <CardHeader className="pb-1">
            <CardTitle className="text-muted-foreground text-xs font-medium uppercase">
              P&amp;L
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-xl font-bold">
              <PnlDisplay pnl={asset.pnlBase} title={nativeHint(asset.pnl, asset.pnlBase)} />
            </p>
            <div className="space-y-0.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground text-xs">Unrealized</span>
                <PnlDisplay
                  pnl={unrealizedPnlBase}
                  title={nativeHint(unrealizedPnl, unrealizedPnlBase)}
                />
              </div>
              {realizedPnlBase !== null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-xs">Realized</span>
                  <PnlDisplay
                    pnl={realizedPnlBase}
                    title={nativeHint(realizedPnl, realizedPnlBase)}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Price Tracking */}
      {showTrackingSection && (
        <Card className={updateTracking.isPending ? "pointer-events-none opacity-60" : ""}>
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
                      {(PROVIDER_LABELS as Record<string, string | undefined>)[provider] ??
                        provider}
                      :
                    </span>
                    {symbol}
                    <button
                      type="button"
                      className="hover:text-destructive relative ml-0.5 after:absolute after:-inset-2"
                      disabled={updateTracking.isPending}
                      onClick={() => {
                        const next = Object.fromEntries(
                          Object.entries(asset.symbolMap ?? {}).filter(([k]) => k !== provider)
                        ) as SymbolMap;
                        handleUpdateTracking(next);
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
            {updateTracking.isError && (
              <p className="text-destructive mt-2 text-sm">{updateTracking.error.message}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      <AssetDetailCharts
        assetId={asset.id}
        type={asset.type}
        currency={asset.currency}
        tracked={asset.symbolMap !== null && Object.keys(asset.symbolMap).length > 0}
      />

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
          onOpenChange={resetOnClose(() => setShowEdit(false), updateAsset)}
          onSubmit={handleEdit}
          initialData={asset}
          loading={updateAsset.isPending}
          submitError={updateAsset.error?.message}
        />
      )}

      {showDelete && (
        <ConfirmDeleteDialog
          open={showDelete}
          onOpenChange={resetOnClose(() => setShowDelete(false), deleteAsset)}
          title="Delete Asset"
          description={`Are you sure you want to delete "${asset.name}"?`}
          onConfirm={handleDelete}
          // Stays busy after success, until the navigation away lands.
          loading={deleteAsset.isPending || deleteAsset.isSuccess}
          error={deleteAsset.error?.message}
        >
          {asset.currentHoldings > 0 && (
            <p className="flex items-start gap-2 text-sm text-amber-600">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                This asset still has{" "}
                <strong>
                  {formatQuantity(asset.currentHoldings)} {holdingsUnit(asset)}
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
        onDone={handleUpdateTracking}
        assetType={asset.type}
      />

      {showBuy && (
        <BuySellDialog
          open={showBuy}
          onOpenChange={resetOnClose(() => setShowBuy(false), buyAsset)}
          mode="buy"
          asset={asset}
          onSubmit={(data) => handleBuy(data, () => setShowBuy(false))}
          loading={buyAsset.isPending}
          submitError={buyAsset.error?.message}
        />
      )}

      {showSell && (
        <BuySellDialog
          open={showSell}
          onOpenChange={resetOnClose(() => setShowSell(false), sellAsset)}
          mode="sell"
          asset={asset}
          onSubmit={(data) => handleSell(data, () => setShowSell(false))}
          loading={sellAsset.isPending}
          submitError={sellAsset.error?.message}
        />
      )}

      {showDeposit && (
        <DepositWithdrawDialog
          open={showDeposit}
          onOpenChange={resetOnClose(() => setShowDeposit(false), buyAsset)}
          mode="deposit"
          asset={asset}
          onSubmit={(data) => handleBuy(data, () => setShowDeposit(false))}
          loading={buyAsset.isPending}
          submitError={buyAsset.error?.message}
        />
      )}

      {showWithdraw && (
        <DepositWithdrawDialog
          open={showWithdraw}
          onOpenChange={resetOnClose(() => setShowWithdraw(false), sellAsset)}
          mode="withdraw"
          asset={asset}
          onSubmit={(data) => handleSell(data, () => setShowWithdraw(false))}
          loading={sellAsset.isPending}
          submitError={sellAsset.error?.message}
        />
      )}

      {showPrice && (
        <RecordPriceDialog
          open={showPrice}
          onOpenChange={resetOnClose(() => setShowPrice(false), recordPrice)}
          asset={asset}
          onSubmit={handleRecordPrice}
          loading={recordPrice.isPending}
          submitError={recordPrice.error?.message}
        />
      )}
    </div>
  );
}

/**
 * Says where the displayed price came from, when that is not "a quote from
 * today". A cost-basis fallback is the important case: it is what the user
 * paid, not what the asset is worth, and rendered bare it is indistinguishable
 * from a live quote — which is exactly how a dead price feed stays invisible.
 *
 * A marker rather than a sentence, matching the asset cards: the provenance is
 * an exception worth noticing, not something to read past on every visit. Amber
 * only for the cost-basis case, which is the one that is not a valuation at all.
 */
function PriceProvenance({
  source,
  asOf,
}: {
  source: AssetWithMetrics["priceSource"];
  asOf: AssetWithMetrics["priceAsOf"];
}) {
  // A deposit is 1:1 in its own currency by definition, in any base currency;
  // there is no provenance to report, and a date would imply a valuation that
  // never happened. The caller already hides the price line for deposits, so
  // this is a belt-and-braces guard rather than a reachable branch.
  if (source === null || source === "deposit") return null;

  const today = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD, local
  if (source === "market" && asOf === today) return null;

  const dated = (text: string): string => (asOf === null ? text : `${text} (${asOf})`);
  const explanation =
    source === "lot"
      ? dated("Cost basis of the last trade — no market quote available.")
      : source === "user"
        ? dated("Price set by you.")
        : dated("Most recent market quote — none since.");

  return (
    <Popover>
      <PopoverTrigger asChild>
        {/* A button, not a bare glyph: `title` is hover-only and does nothing
            on touch. */}
        <button
          type="button"
          aria-label="Where this price came from"
          className={
            source === "lot" ? "px-1 py-0.5 text-amber-600 dark:text-amber-500" : "px-1 py-0.5"
          }
        >
          *
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 text-xs" align="start">
        {explanation}
      </PopoverContent>
    </Popover>
  );
}
