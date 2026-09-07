"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyPicker } from "@/components/settings/currency-picker";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SymbolSearch } from "./symbol-search";
import { getBaseCurrency } from "@/lib/format";
import type { AssetType, AssetWithMetrics, SymbolMap } from "@/lib/validators/assets";

interface AssetFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    name: string;
    type: "deposit" | "investment" | "crypto" | "other";
    currency: string;
    symbolMap?: SymbolMap;
    icon?: string;
    color?: string;
  }) => void;
  initialData?: AssetWithMetrics | null;
  loading?: boolean;
}

const ASSET_TYPES = [
  { value: "deposit", label: "Deposit (savings/bank)" },
  { value: "investment", label: "Investment (stocks/ETFs)" },
  { value: "crypto", label: "Crypto" },
  { value: "other", label: "Other" },
] as const;

function initSymbolMap(data: AssetWithMetrics | null | undefined): SymbolMap {
  if (!data?.symbolMap) return {};
  return { ...data.symbolMap };
}

export function AssetFormDialog({
  open,
  onOpenChange,
  onSubmit,
  initialData,
  loading,
}: AssetFormDialogProps): React.ReactElement {
  const isEdit = !!initialData;
  const baseCurrency = getBaseCurrency();
  const [name, setName] = useState(initialData?.name ?? "");
  const [type, setType] = useState<string>(initialData?.type ?? "deposit");
  const [currency, setCurrency] = useState(initialData?.currency ?? baseCurrency);
  const [currencyDirty, setCurrencyDirty] = useState(false);
  const [symbolMap, setSymbolMap] = useState<SymbolMap>(initSymbolMap(initialData));
  const [icon, setIcon] = useState(initialData?.icon ?? "");
  const [error, setError] = useState("");
  const [listingCurrency, setListingCurrency] = useState("");

  /**
   * Auto-fill the currency field from a symbol search result, but only if the
   * user hasn't manually typed in the field yet. Cross-listed instruments
   * (SHEL on LSE in GBP vs NYSE in USD) keep the field editable so the user
   * can override.
   */
  function handleCurrencyHint(hinted: string): void {
    const code = hinted.toUpperCase();
    setListingCurrency(code);
    if (!isEdit && !currencyDirty) {
      setCurrency(code);
    }
  }

  /**
   * An asset's currency is what its quotes are read back in, and some providers
   * can't contradict it: Alpha Vantage's GLOBAL_QUOTE carries no currency
   * field, so it labels the number with whatever was asked for. Configure AAPL
   * as EUR and its dollar price gets cached as euros — correctly fetched, wrong
   * denomination, undetectable from the response. The search result knows the
   * listing currency, so say so here rather than let it surface as a position
   * silently off by an exchange rate.
   *
   * This catches it only at the moment a symbol is picked, because that search
   * result is the sole place the listing currency is ever known — it is not
   * stored on the asset, and re-deriving it on edit would mean a provider
   * search per dialog open, against a 25-request daily quota shared with the
   * price sweep. An asset already saved with the wrong currency stays wrong and
   * silent; fixing that needs the listing currency persisted alongside the
   * symbol map.
   */
  const currencyMismatch =
    listingCurrency !== "" && listingCurrency !== currency.trim().toUpperCase();

  function handleSubmit(e: React.SyntheticEvent): void {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!currency.trim()) {
      setError("Currency is required.");
      return;
    }

    const hasSymbols = Object.keys(symbolMap).length > 0;

    onSubmit({
      name: name.trim(),
      type: type as "deposit" | "investment" | "crypto" | "other",
      currency: currency.trim().toUpperCase(),
      symbolMap: hasSymbols ? symbolMap : undefined,
      icon: icon.trim() || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Asset" : "New Asset"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="asset-name">Name</Label>
            <Input
              id="asset-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Emergency Fund, SPX, Bitcoin"
              disabled={loading}
            />
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType} disabled={loading}>
              <SelectTrigger id="asset-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSET_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="asset-currency">Currency</Label>
            <CurrencyPicker
              id="asset-currency"
              value={currency}
              onChange={(code) => {
                setCurrency(code);
                setCurrencyDirty(true);
              }}
              disabled={loading}
            />
          </div>
          {/* Base-currency deposits are pure cash and need no price tracking.
              Anything else (foreign-currency deposit, investment, crypto)
              benefits from a price/FX feed. */}
          {(type !== "deposit" || currency !== baseCurrency) && (
            <div className="space-y-1">
              <Label>
                {type === "deposit"
                  ? "Exchange Rate Tracking (optional)"
                  : "Price Tracking (optional)"}
              </Label>
              <SymbolSearch
                value={symbolMap}
                onChange={setSymbolMap}
                onCurrencyHint={handleCurrencyHint}
                disabled={loading}
                assetType={type as AssetType}
              />
              {currencyMismatch && (
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  {type === "deposit" ? (
                    <>
                      This tracks the {listingCurrency} rate, but the account holds {currency}. Pick
                      the {currency} symbol so the balance converts at its own rate.
                    </>
                  ) : (
                    <>
                      This symbol is listed in {listingCurrency}, but the asset is set to {currency}
                      . Its quotes will be recorded as {currency} — set the currency to{" "}
                      {listingCurrency} unless you know the provider converts.
                    </>
                  )}
                </p>
              )}
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="asset-icon">Icon (emoji, optional)</Label>
            <Input
              id="asset-icon"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="🏦"
              disabled={loading}
            />
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {isEdit ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
