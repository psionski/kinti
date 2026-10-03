"use client";

import { useState } from "react";
import { useFxPreview } from "@/hooks/use-fx-preview";
import { isoToday } from "@/lib/date-ranges";
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
import { formatCurrency, formatQuantity, getBaseCurrency } from "@/lib/format";
import type { AssetWithMetrics } from "@/lib/validators/assets";

interface DepositWithdrawDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "deposit" | "withdraw";
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

export function DepositWithdrawDialog({
  open,
  onOpenChange,
  mode,
  asset,
  onSubmit,
  loading,
  submitError,
}: DepositWithdrawDialogProps): React.ReactElement {
  const today = isoToday();
  const baseCurrency = getBaseCurrency();
  // Base-currency deposits are pure cash and need no FX preview. Foreign-
  // currency deposits show a read-only base-currency equivalent fetched from
  // the same FX provider chain that the server uses at write time.
  const isForeign = asset.currency !== baseCurrency;

  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  // Read-only base-currency preview, refreshed whenever amount or date
  // changes, through the same FX chain AssetLotService.toBase applies at write
  // time — no drift between preview and persisted value.
  const amt = parseFloat(amount);
  const { preview: basePreview, fetching: fetchingPreview } = useFxPreview({
    amount: open && isForeign && amt > 0 ? amt : null,
    from: asset.currency,
    to: baseCurrency,
    date,
  });

  function handleSubmit(e: React.SyntheticEvent): void {
    e.preventDefault();
    setError("");

    if (Number.isNaN(amt) || amt <= 0) {
      setError("Amount must be a positive number.");
      return;
    }

    // Deposit assets ALWAYS have pricePerUnit = 1, regardless of currency
    // (see AssetLotService.assertDepositPrice and BuyAssetSchema). The
    // foreign-currency conversion happens server-side via toBase(), which
    // walks the same FX provider chain as our preview above.
    onSubmit({
      quantity: amt,
      pricePerUnit: 1,
      date,
      description: description.trim() || undefined,
    });
  }

  const actionLabel = mode === "deposit" ? "Deposit" : "Withdraw";
  const title = mode === "deposit" ? `Deposit to ${asset.name}` : `Withdraw from ${asset.name}`;
  const desc =
    mode === "deposit"
      ? "Record a deposit."
      : `Record a withdrawal. Current balance: ${formatQuantity(asset.currentHoldings)} ${asset.currency}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{desc}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="dep-amount">Amount ({asset.currency})</Label>
            <Input
              id="dep-amount"
              type="number"
              step="any"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 5000"
              disabled={loading}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="dep-date">Date</Label>
            <Input
              id="dep-date"
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dep-desc">Description (optional)</Label>
            <Input
              id="dep-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Auto-generated if left blank"
              disabled={loading}
            />
          </div>

          {isForeign && basePreview && (
            <div
              data-testid="deposit-base-preview"
              className="bg-muted/50 text-muted-foreground rounded-md px-3 py-2 text-xs"
            >
              <div className="flex justify-between">
                <span>Total ({asset.currency})</span>
                <span className="font-mono">{formatCurrency(amt, asset.currency)}</span>
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
          {isForeign && fetchingPreview && !basePreview && (
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <Loader2 className="size-3 animate-spin" />
              Fetching exchange rate…
            </div>
          )}

          {(error || submitError) && (
            <p className="text-destructive text-sm">{error || submitError}</p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {actionLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
