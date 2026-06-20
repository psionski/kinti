"use client";

import { useState } from "react";
import { Plus, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBaseCurrency } from "@/lib/format";
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
  name: string;
  type: "investment" | "crypto";
  quantity: string;
  costBasis: string;
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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const baseCurrency = getBaseCurrency();
  const symbol = baseCurrencySymbol();

  async function handleSave(): Promise<void> {
    const valid = entries.filter((e) => e.name.trim() && parseFloat(e.quantity) > 0);
    if (valid.length === 0) {
      onContinue();
      return;
    }
    setSaving(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      for (const entry of valid) {
        const quantity = parseFloat(entry.quantity);
        const costBasis = entry.costBasis.trim() ? parseFloat(entry.costBasis) : 0;
        const pricePerUnit = costBasis > 0 ? costBasis / quantity : 0;

        const assetRes = await fetch("/api/assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: entry.name, type: entry.type, currency: baseCurrency }),
        });
        if (!assetRes.ok) continue;
        const asset = await assetRes.json();
        await fetch(`/api/assets/${asset.id}/lots`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity, pricePerUnit, date: today }),
        });
      }
      setSaved(true);
      if (isOnboarding) onContinue();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section
      title="Investments"
      description="Stocks, ETFs, or crypto you already own. You can set up price tracking later."
      icon={<TrendingUp className="text-muted-foreground size-5" />}
    >
      <div className="max-w-md space-y-3">
        {entries.map((entry, i) => (
          <div key={i} className="space-y-2 rounded-md border p-3">
            <div className="flex gap-2">
              <Input
                placeholder="Name (e.g. Bitcoin, SPX ETF)"
                value={entry.name}
                disabled={saved}
                onChange={(e) => {
                  const next = [...entries];
                  next[i] = { ...next[i], name: e.target.value };
                  setEntries(next);
                }}
              />
              <select
                className="border-input bg-background rounded-md border px-2 text-sm"
                value={entry.type}
                disabled={saved}
                onChange={(e) => {
                  const next = [...entries];
                  next[i] = { ...next[i], type: e.target.value as "investment" | "crypto" };
                  setEntries(next);
                }}
              >
                <option value="investment">Stock/ETF</option>
                <option value="crypto">Crypto</option>
              </select>
              {!saved && (
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
                  disabled={saved}
                  onChange={(e) => {
                    const next = [...entries];
                    next[i] = { ...next[i], quantity: e.target.value };
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
                    disabled={saved}
                    onChange={(e) => {
                      const next = [...entries];
                      next[i] = { ...next[i], costBasis: e.target.value };
                      setEntries(next);
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
        {!saved && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setEntries([
                ...entries,
                { name: "", type: "investment", quantity: "", costBasis: "" },
              ])
            }
          >
            <Plus className="mr-1.5 size-3.5" />
            Add investment
          </Button>
        )}
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => void handleSave()} disabled={saving || saved}>
            {saving ? "Saving..." : saved ? "Saved" : "Save"}
          </Button>
          {isOnboarding && !saved && (
            <Button variant="ghost" size="sm" onClick={onContinue}>
              Skip
            </Button>
          )}
        </div>
      </div>
    </Section>
  );
}
