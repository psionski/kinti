"use client";

import { useState } from "react";
import { Plus, PiggyBank } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

interface SavingsEntry {
  name: string;
  balance: string;
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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const baseCurrency = getBaseCurrency();
  const symbol = baseCurrencySymbol();

  async function handleSave(): Promise<void> {
    const valid = entries.filter((e) => e.name.trim() && parseFloat(e.balance) > 0);
    if (valid.length === 0) {
      onContinue();
      return;
    }
    setSaving(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      for (const entry of valid) {
        const balance = parseFloat(entry.balance);
        const assetRes = await fetch("/api/assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: entry.name, type: "deposit", currency: baseCurrency }),
        });
        if (!assetRes.ok) continue;
        const asset = await assetRes.json();
        await fetch(`/api/assets/${asset.id}/lots`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity: balance, pricePerUnit: 1, date: today }),
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
      title="Savings Accounts"
      description="Add savings accounts with their current balance."
      icon={<PiggyBank className="text-muted-foreground size-5" />}
    >
      <div className="max-w-md space-y-3">
        {entries.map((entry, i) => (
          <div key={i} className="flex gap-2">
            <Input
              placeholder="Account name"
              value={entry.name}
              disabled={saved}
              onChange={(e) => {
                const next = [...entries];
                next[i] = { ...next[i], name: e.target.value };
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
                disabled={saved}
                onChange={(e) => {
                  const next = [...entries];
                  next[i] = { ...next[i], balance: e.target.value };
                  setEntries(next);
                }}
              />
            </div>
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
        ))}
        {!saved && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEntries([...entries, { name: "", balance: "" }])}
          >
            <Plus className="mr-1.5 size-3.5" />
            Add savings account
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
