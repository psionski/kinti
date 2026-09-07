"use client";

import { useState } from "react";
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
import { isoToday } from "@/lib/date-ranges";
import { formatUnitPrice } from "@/lib/format";
import type { AssetWithMetrics } from "@/lib/validators/assets";

interface RecordPriceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: AssetWithMetrics;
  onSubmit: (data: { pricePerUnit: number; recordedAt?: string }) => void;
  loading?: boolean;
}

export function RecordPriceDialog({
  open,
  onOpenChange,
  asset,
  onSubmit,
  loading,
}: RecordPriceDialogProps): React.ReactElement {
  const currentDisplay =
    asset.latestPrice !== null
      ? `Current price: ${formatUnitPrice(asset.latestPrice, asset.currency)} per unit`
      : "No price recorded yet";

  const today = isoToday();
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(today);
  const [error, setError] = useState("");

  function handleSubmit(e: React.SyntheticEvent): void {
    e.preventDefault();
    setError("");

    const priceNum = parseFloat(price);
    if (Number.isNaN(priceNum) || priceNum <= 0) {
      setError("Price must be a positive number.");
      return;
    }

    const recordedAt = date && date !== today ? date + "T00:00:00" : undefined;
    onSubmit({ pricePerUnit: priceNum, recordedAt });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Set Price — {asset.name}</DialogTitle>
          <DialogDescription asChild>
            <div>
              <p>
                Manually record a market price for this asset. Useful for assets that can&apos;t be
                tracked automatically.
              </p>
              <p>{currentDisplay}.</p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="new-price">Price per unit ({asset.currency})</Label>
            <Input
              id="new-price"
              type="number"
              step="any"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="e.g. 360.00"
              disabled={loading}
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="price-date">Date</Label>
            <Input
              id="price-date"
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              disabled={loading}
            />
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              Save Price
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
