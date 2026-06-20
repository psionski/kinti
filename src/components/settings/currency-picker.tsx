"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// ─── Currency catalogue (built once at module load) ──────────────────────────

/** Pinned to the top of the list — covers >90% of likely user picks. */
const POPULAR_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD"] as const;

const ALL_CURRENCIES: readonly string[] = (() => {
  try {
    return Intl.supportedValuesOf("currency");
  } catch {
    // Older runtime fallback — list the popular ones at minimum.
    return [...POPULAR_CURRENCIES];
  }
})();

interface CurrencyEntry {
  code: string;
  name: string;
  symbol: string;
}

/**
 * Build display metadata for a currency code via Intl. We extract the symbol
 * by formatting 0 with `currencyDisplay: 'narrowSymbol'` and stripping digits.
 */
function buildEntry(code: string): CurrencyEntry {
  let name = code;
  let symbol = code;
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "currency" });
    name = dn.of(code) ?? code;
  } catch {
    // ignore — fall back to code
  }
  try {
    const fmt = new Intl.NumberFormat("en", {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    });
    const parts = fmt.formatToParts(0);
    const symbolPart = parts.find((p) => p.type === "currency");
    if (symbolPart) symbol = symbolPart.value;
  } catch {
    // ignore — fall back to code
  }
  return { code, name, symbol };
}

const CURRENCY_ENTRIES: CurrencyEntry[] = (() => {
  const entries = ALL_CURRENCIES.map(buildEntry);
  const popularSet = new Set<string>(POPULAR_CURRENCIES);
  const popular = entries.filter((e) => popularSet.has(e.code));
  // Sort popular by their order in POPULAR_CURRENCIES; rest alphabetical by code.
  popular.sort(
    (a, b) =>
      POPULAR_CURRENCIES.indexOf(a.code as (typeof POPULAR_CURRENCIES)[number]) -
      POPULAR_CURRENCIES.indexOf(b.code as (typeof POPULAR_CURRENCIES)[number])
  );
  const rest = entries.filter((e) => !popularSet.has(e.code));
  rest.sort((a, b) => a.code.localeCompare(b.code));
  return [...popular, ...rest];
})();

const CURRENCY_BY_CODE = new Map(CURRENCY_ENTRIES.map((e) => [e.code, e]));

// ─── Component ────────────────────────────────────────────────────────────────

interface CurrencyPickerProps {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  id?: string;
}

export function CurrencyPicker({
  value,
  onChange,
  disabled,
  id,
}: CurrencyPickerProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (disabled) return;
      setOpen(next);
      if (next) {
        setSearch("");
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    },
    [disabled]
  );

  const filtered = useMemo(() => {
    if (!search) return CURRENCY_ENTRIES;
    const lower = search.toLowerCase();
    return CURRENCY_ENTRIES.filter(
      (e) =>
        e.code.toLowerCase().includes(lower) ||
        e.name.toLowerCase().includes(lower) ||
        e.symbol.toLowerCase().includes(lower)
    );
  }, [search]);

  const selected = CURRENCY_BY_CODE.get(value);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          className="w-full justify-between font-normal"
          disabled={disabled}
        >
          {selected ? (
            <span className="flex items-center gap-2">
              <span className="text-muted-foreground tabular-nums">{selected.code}</span>
              <span className="text-muted-foreground">·</span>
              <span>{selected.name}</span>
            </span>
          ) : (
            (value ?? "Select currency...")
          )}
          <ChevronDown className="text-muted-foreground size-4 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <div className="p-2">
          <Input
            ref={inputRef}
            placeholder="Search currencies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="max-h-[280px] overflow-y-auto border-t">
          {filtered.length === 0 ? (
            <div className="text-muted-foreground p-3 text-center text-sm">No currencies found</div>
          ) : (
            filtered.map((entry) => (
              <button
                key={entry.code}
                type="button"
                data-testid={`currency-option-${entry.code}`}
                className="hover:bg-accent flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
                onClick={() => {
                  onChange(entry.code);
                  setOpen(false);
                }}
              >
                <Check
                  className={`size-3.5 shrink-0 ${entry.code === value ? "opacity-100" : "opacity-0"}`}
                />
                <span className="text-muted-foreground w-10 shrink-0 tabular-nums">
                  {entry.code}
                </span>
                <span className="flex-1 truncate">{entry.name}</span>
                <span className="text-muted-foreground shrink-0">{entry.symbol}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
