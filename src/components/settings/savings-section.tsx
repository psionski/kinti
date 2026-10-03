"use client";

import { useState } from "react";
import { Plus, PiggyBank } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getBaseCurrency } from "@/lib/format";
import { isoToday } from "@/lib/date-ranges";
import { useAddOpeningAssets } from "@/lib/queries/settings";
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

interface SavingsEntry {
  /** Stable across edits and saves, so a retried save can tell entries apart. */
  key: string;
  name: string;
  balance: string;
}

let lastEntryKey = 0;
function newEntryKey(): string {
  return String(++lastEntryKey);
}

interface SavingsSectionProps {
  isOnboarding: boolean;
  onContinue: () => void;
}

export function SavingsSection({
  isOnboarding,
  onContinue,
}: SavingsSectionProps): React.ReactElement {
  const [entries, setEntries] = useState<SavingsEntry[]>([]);
  const addAssets = useAddOpeningAssets();
  const saved = addAssets.isSuccess;
  const baseCurrency = getBaseCurrency();
  const symbol = baseCurrencySymbol();

  function handleSave(): void {
    const valid = entries.filter((e) => e.name.trim() && parseFloat(e.balance) > 0);
    if (valid.length === 0) {
      onContinue();
      return;
    }
    const today = isoToday();
    addAssets.mutate(
      valid.map((entry) => ({
        key: entry.key,
        asset: { name: entry.name, type: "deposit", currency: baseCurrency },
        lot: { quantity: parseFloat(entry.balance), pricePerUnit: 1, date: today },
      })),
      {
        onSuccess: () => {
          if (isOnboarding) onContinue();
        },
      }
    );
  }

  return (
    <Section
      title="Savings Accounts"
      description="Add savings accounts with their current balance."
      icon={<PiggyBank className="text-muted-foreground size-5" />}
    >
      <div className="max-w-md space-y-3">
        {entries.map((entry, i) => {
          // An entry whose account already exists stays as it was saved.
          const locked = saved || addAssets.isCreated(entry.key);
          return (
            <div key={entry.key} className="flex gap-2">
              <Input
                placeholder="Account name"
                value={entry.name}
                disabled={locked}
                onChange={(e) => {
                  const next = [...entries];
                  next[i] = { ...next[i]!, name: e.target.value };
                  setEntries(next);
                }}
              />
              <div className="relative min-w-[140px]">
                <span className="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2 text-sm">
                  {symbol}
                </span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Balance"
                  className="pl-7"
                  value={entry.balance}
                  disabled={locked}
                  onChange={(e) => {
                    const next = [...entries];
                    next[i] = { ...next[i]!, balance: e.target.value };
                    setEntries(next);
                  }}
                />
              </div>
              {!locked && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 px-2"
                  onClick={() => setEntries(entries.filter((_, j) => j !== i))}
                >
                  &times;
                </Button>
              )}
            </div>
          );
        })}
        {!saved && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEntries([...entries, { key: newEntryKey(), name: "", balance: "" }])}
          >
            <Plus className="mr-1.5 size-3.5" />
            Add savings account
          </Button>
        )}
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleSave} disabled={addAssets.isPending || saved}>
            {addAssets.isPending ? "Saving..." : saved ? "Saved" : "Save"}
          </Button>
          {isOnboarding && !saved && (
            <Button variant="ghost" size="sm" onClick={onContinue}>
              Skip
            </Button>
          )}
        </div>
        {addAssets.error && <p className="text-destructive text-sm">{addAssets.error.message}</p>}
      </div>
    </Section>
  );
}
