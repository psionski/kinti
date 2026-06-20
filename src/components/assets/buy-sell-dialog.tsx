"use client";

import { useState, useEffect } from "react";
import { isoToday } from "@/lib/date-ranges";
import { formatCurrency, formatPrice, getBaseCurrency } from "@/lib/format";
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
}

export function BuySellDialog({
  open,
  onOpenChange,
  mode,
  asset,
  onSubmit,
  loading,
}: BuySellDialogProps): React.ReactElement {
  const today = isoToday();
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [basePreview, setBasePreview] = useState<{
    base: number;
    rate: number;
  } | null>(null);

  const baseCurrency = getBaseCurrency();
  const isForeign = asset.currency !== baseCurrency;

  // Fetch price for the selected date (re-fetches when date changes)
  useEffect(() => {
    if (!open || !asset.symbolMap) return;
    let cancelled = false;
    void (async () => {
      setFetchingPrice(true);
      try {
        const params = new URLSearchParams({
          symbolMap: JSON.stringify(asset.symbolMap),
          currency: asset.currency,
          date,
        });
        const res = await fetch(`/api/financial/price?${params}`);
        if (!cancelled && res.ok) {
          const data = (await res.json()) as { price: number };
          setPrice(formatPrice(data.price));
        }
      } finally {
        if (!cancelled) setFetchingPrice(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, date, asset.symbolMap, asset.currency]);

  // Quote the FX rate from the asset's currency to the configured base on the
  // selected date — same provider chain as the eventual write. Fires whenever
  // the user changes the date or amount, so the preview tracks input live.
  useEffect(() => {
    if (!open || !isForeign) {
      setBasePreview(null);
      return;
    }
    const qty = parseFloat(quantity);
    const priceNum = parseFloat(price);
    if (Number.isNaN(qty) || qty <= 0 || Number.isNaN(priceNum) || priceNum <= 0) {
      setBasePreview(null);
      return;
    }
    const total = qty * priceNum;
    let cancelled = false;
    void (async () => {
      const params = new URLSearchParams({
        amount: String(total),
        from: asset.currency,
        to: baseCurrency,
        date,
      });
      try {
        const res = await fetch(`/api/financial/convert?${params}`);
        if (!cancelled && res.ok) {
          const data = (await res.json()) as { converted: number; rate: number };
          setBasePreview({ base: data.converted, rate: data.rate });
        }
      } catch {
        if (!cancelled) setBasePreview(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, isForeign, quantity, price, date, asset.currency, baseCurrency]);

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    setError("");

    const qty = parseFloat(quantity);
    if (Number.isNaN(qty) || qty <= 0) {
      setError("Quantity must be a positive number.");
      return;
    }

    const priceNum = parseFloat(price);
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
      : `Record a sale. Creates a transfer transaction (cash in) + negative lot. Current holdings: ${asset.currentHoldings}`;

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
                onChange={(e) => setPrice(e.target.value)}
                placeholder={fetchingPrice ? "Fetching…" : "e.g. 345.63"}
                disabled={loading}
              />
              {fetchingPrice && (
                <Loader2 className="text-muted-foreground absolute top-2.5 right-3 size-4 animate-spin" />
              )}
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="lot-date">Date</Label>
            <Input
              id="lot-date"
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
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
                <span className="font-mono">
                  {formatCurrency(parseFloat(quantity) * parseFloat(price), asset.currency)}
                </span>
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
          {error && <p className="text-destructive text-sm">{error}</p>}
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
