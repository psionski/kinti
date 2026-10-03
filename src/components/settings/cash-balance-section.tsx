"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBaseCurrency } from "@/lib/format";
import { useCreateTransaction } from "@/lib/queries/transactions";
import { Section } from "./settings-section";

/** Currency symbol for the configured base currency, derived via Intl. */
function baseCurrencySymbol(): string {
  const currency = getBaseCurrency();
  try {
    const fmt = new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    });
    const part = fmt.formatToParts(0).find((p) => p.type === "currency");
    return part?.value ?? currency;
  } catch {
    return currency;
  }
}

interface CashBalanceSectionProps {
  isOnboarding: boolean;
  onContinue: () => void;
}

export function CashBalanceSection({
  isOnboarding,
  onContinue,
}: CashBalanceSectionProps): React.ReactElement {
  const [amount, setAmount] = useState("");
  const createTx = useCreateTransaction();
  const saved = createTx.isSuccess;

  function handleSave(): void {
    const value = parseFloat(amount);
    if (!value || value <= 0) {
      onContinue();
      return;
    }
    createTx.mutate(
      { amount: value, type: "transfer", description: "Opening balance" },
      {
        onSuccess: () => {
          if (isOnboarding) onContinue();
        },
      }
    );
  }

  return (
    <Section
      title="Checking Account Balance"
      description="How much is in your main bank account right now? Creates an opening balance without inflating income reports."
      icon={<Wallet className="text-muted-foreground size-5" />}
    >
      <div className="max-w-md space-y-3">
        <div className="space-y-2">
          <Label htmlFor="cash-balance">Current balance</Label>
          <div className="relative">
            <span className="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2 text-sm">
              {baseCurrencySymbol()}
            </span>
            <Input
              id="cash-balance"
              type="number"
              step="0.01"
              min="0"
              placeholder="5000.00"
              className="pl-7"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={saved}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleSave} disabled={createTx.isPending || saved}>
            {createTx.isPending ? "Saving..." : saved ? "Saved" : "Save"}
          </Button>
          {isOnboarding && !saved && (
            <Button variant="ghost" size="sm" onClick={onContinue}>
              Skip
            </Button>
          )}
        </div>
        {createTx.error && <p className="text-destructive text-sm">{createTx.error.message}</p>}
      </div>
    </Section>
  );
}
