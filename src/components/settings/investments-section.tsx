"use client";

import { useState } from "react";
import { Plus, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface InvestmentEntry {
  /** Stable across edits and saves, so a retried save can tell entries apart. */
  key: string;
  name: string;
  type: "investment" | "crypto";
  quantity: string;
  costBasis: string;
}

let lastEntryKey = 0;
function newEntryKey(): string {
  return String(++lastEntryKey);
}

interface InvestmentsSectionProps {
  isOnboarding: boolean;
  onContinue: () => void;
}

export function InvestmentsSection({
  isOnboarding,
  onContinue,
}: InvestmentsSectionProps): React.ReactElement {
  const [entries, setEntries] = useState<InvestmentEntry[]>([]);
  const addAssets = useAddOpeningAssets();
  const saved = addAssets.isSuccess;
  const baseCurrency = getBaseCurrency();
  const symbol = baseCurrencySymbol();

  function handleSave(): void {
    const valid = entries.filter((e) => e.name.trim() && parseFloat(e.quantity) > 0);
    if (valid.length === 0) {
      onContinue();
      return;
    }
    const today = isoToday();
    addAssets.mutate(
      valid.map((entry) => {
        const quantity = parseFloat(entry.quantity);
        const costBasis = entry.costBasis.trim() ? parseFloat(entry.costBasis) : 0;
        const pricePerUnit = costBasis > 0 ? costBasis / quantity : 0;
        return {
          key: entry.key,
          asset: { name: entry.name, type: entry.type, currency: baseCurrency },
          lot: { quantity, pricePerUnit, date: today },
        };
      }),
      {
        onSuccess: () => {
          if (isOnboarding) onContinue();
        },
      }
    );
  }

  return (
    <Section
      title="Investments"
      description="Stocks, ETFs, or crypto you already own. You can set up price tracking later."
      icon={<TrendingUp className="text-muted-foreground size-5" />}
    >
      <div className="max-w-md space-y-3">
        {entries.map((entry, i) => {
          // An entry whose holding already exists stays as it was saved.
          const locked = saved || addAssets.isCreated(entry.key);
          return (
            <div key={entry.key} className="space-y-2 rounded-md border p-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Name (e.g. Bitcoin, SPX ETF)"
                  value={entry.name}
                  disabled={locked}
                  onChange={(e) => {
                    const next = [...entries];
                    next[i] = { ...next[i]!, name: e.target.value };
                    setEntries(next);
                  }}
                />
                <select
                  className="border-input bg-background rounded-md border px-2 text-sm"
                  value={entry.type}
                  disabled={locked}
                  onChange={(e) => {
                    const next = [...entries];
                    next[i] = { ...next[i]!, type: e.target.value as "investment" | "crypto" };
                    setEntries(next);
                  }}
                >
                  <option value="investment">Stock/ETF</option>
                  <option value="crypto">Crypto</option>
                </select>
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
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Quantity</Label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="e.g. 10 or 0.5"
                    value={entry.quantity}
                    disabled={locked}
                    onChange={(e) => {
                      const next = [...entries];
                      next[i] = { ...next[i]!, quantity: e.target.value };
                      setEntries(next);
                    }}
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Total cost basis</Label>
                  <div className="relative">
                    <span className="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2 text-sm">
                      {symbol}
                    </span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Optional"
                      className="pl-7"
                      value={entry.costBasis}
                      disabled={locked}
                      onChange={(e) => {
                        const next = [...entries];
                        next[i] = { ...next[i]!, costBasis: e.target.value };
                        setEntries(next);
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {!saved && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setEntries([
                ...entries,
                { key: newEntryKey(), name: "", type: "investment", quantity: "", costBasis: "" },
              ])
            }
          >
            <Plus className="mr-1.5 size-3.5" />
            Add investment
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
