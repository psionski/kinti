"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFxPreview } from "@/hooks/use-fx-preview";
import { isoToday } from "@/lib/date-ranges";
import {
  formatCurrency,
  formatQuantity,
  getBaseCurrency,
  holdingsUnit,
  priceInputValue,
} from "@/lib/format";
import { priceQuery } from "@/lib/queries/financial";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AssetWithMetrics } from "@/lib/validators/assets";

interface BuySellDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "buy" | "sell";
  asset: AssetWithMetrics;
  onSubmit: (data: {
    quantity: number;
    pricePerUnit: number;
    date: string;
    description?: string;
  }) => void;
  loading?: boolean;
  /** Why the server refused the last submit, if it did. */
  submitError?: string | null;
}

export function BuySellDialog({
  open,
  onOpenChange,
  mode,
  asset,
  onSubmit,
  loading,
  submitError,
}: BuySellDialogProps): React.ReactElement {
  const today = isoToday();
  const [quantity, setQuantity] = useState("");
  // What the user typed over the looked-up price, if anything.
  const [priceOverride, setPriceOverride] = useState<string | null>(null);
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  const baseCurrency = getBaseCurrency();
  const isForeign = asset.currency !== baseCurrency;

  // A tracked asset's price for the selected date prefills the price field.
  const symbolMap = asset.symbolMap ?? {};
  const tracked = Object.keys(symbolMap).length > 0;
  const lookup = useQuery({
    ...priceQuery({ symbolMap, currency: asset.currency, date }),
    enabled: open && tracked,
  });
  const price = priceOverride ?? (lookup.data ? priceInputValue(lookup.data.price) : "");
  const fetchingPrice = lookup.isFetching;

  function handleDateChange(next: string): void {
    setDate(next);
    // The new day has its own quote, which replaces a price typed for the old one.
    if (tracked) setPriceOverride(null);
  }

  // Quote the total in the configured base on the selected date, live as the
  // user edits the quantity, price or date.
  const qty = parseFloat(quantity);
  const priceNum = parseFloat(price);
  const { preview: basePreview } = useFxPreview({
    amount: open && isForeign && qty > 0 && priceNum > 0 ? qty * priceNum : null,
    from: asset.currency,
    to: baseCurrency,
    date,
  });

  function handleSubmit(e: React.SyntheticEvent): void {
    e.preventDefault();
    setError("");

    if (Number.isNaN(qty) || qty <= 0) {
      setError("Quantity must be a positive number.");
      return;
    }

    if (Number.isNaN(priceNum) || priceNum <= 0) {
      setError("Price must be a positive number.");
      return;
    }

    onSubmit({
      quantity: qty,
      pricePerUnit: priceNum,
      date,
      description: description.trim() || undefined,
    });
  }

  const title = mode === "buy" ? `Buy ${asset.name}` : `Sell ${asset.name}`;
  const desc =
    mode === "buy"
      ? `Record a purchase. Creates a transfer transaction (cash out) + asset lot.`
      : `Record a sale. Creates a transfer transaction (cash in) + negative lot. Current holdings: ${formatQuantity(asset.currentHoldings)} ${holdingsUnit(asset)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{desc}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="lot-quantity">Quantity</Label>
            <Input
              id="lot-quantity"
              type="number"
              step="any"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 10 or 0.5"
              disabled={loading}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lot-price">Price per unit ({asset.currency})</Label>
            <div className="relative">
              <Input
                id="lot-price"
                type="number"
                step="any"
                min="0"
                value={price}
                onChange={(e) => setPriceOverride(e.target.value)}
                placeholder={fetchingPrice ? "Fetching…" : "e.g. 345.63"}
                disabled={loading}
              />
              {fetchingPrice && (
                <Loader2 className="text-muted-foreground absolute top-2.5 right-3 size-4 animate-spin" />
              )}
            </div>
            {lookup.isError && price === "" && (
              <p className="text-muted-foreground text-xs">
                No price available for this date — enter it manually.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="lot-date">Date</Label>
            <Input
              id="lot-date"
              type="date"
              value={date}
              max={today}
              onChange={(e) => handleDateChange(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lot-desc">Description (optional)</Label>
            <Input
              id="lot-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Auto-generated if left blank"
              disabled={loading}
            />
          </div>
          {isForeign && basePreview && (
            <div className="bg-muted/50 text-muted-foreground rounded-md px-3 py-2 text-xs">
              <div className="flex justify-between">
                <span>Total ({asset.currency})</span>
                <span className="font-mono">{formatCurrency(qty * priceNum, asset.currency)}</span>
              </div>
              <div className="text-foreground flex justify-between font-medium">
                <span>≈ {baseCurrency}</span>
                <span className="font-mono">{formatCurrency(basePreview.base)}</span>
              </div>
              <div className="mt-1 text-[11px] opacity-70">
                Rate: 1 {asset.currency} = {basePreview.rate.toFixed(4)} {baseCurrency}
              </div>
            </div>
          )}
          {(error || submitError) && (
            <p className="text-destructive text-sm">{error || submitError}</p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {mode === "buy" ? "Buy" : "Sell"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
