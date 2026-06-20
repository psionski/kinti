"use client";

import { useState, useRef, useCallback } from "react";
import { Search, X, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PROVIDER_LABELS } from "@/lib/providers/labels";
import type { AssetType } from "@/lib/validators/assets";

const MAX_PER_PROVIDER = 5;
const DEBOUNCE_MS = 300;

interface SymbolSearchResult {
  provider: string;
  symbol: string;
  name: string;
  type?: string;
  /** ISO 4217 listing currency, when the provider exposes it. */
  currency?: string;
}

type SymbolMap = Record<string, string>;

interface SymbolSearchProps {
  value: SymbolMap;
  onChange: (map: SymbolMap) => void;
  /** Called when the user picks a result, with the result's listing currency (if any). */
  onCurrencyHint?: (currency: string) => void;
  disabled?: boolean;
  assetType?: AssetType;
}

function groupByProvider(results: SymbolSearchResult[]): Map<string, SymbolSearchResult[]> {
  const grouped = new Map<string, SymbolSearchResult[]>();
  for (const r of results) {
    const list = grouped.get(r.provider) ?? [];
    if (list.length < MAX_PER_PROVIDER) {
      list.push(r);
    }
    grouped.set(r.provider, list);
  }
  return grouped;
}

// ─── Search Dialog (shared by both form field and standalone trigger) ────────

interface SymbolSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: SymbolMap;
  onDone: (map: SymbolMap) => void;
  /** Called when the user picks a result, with the result's listing currency (if any). */
  onCurrencyHint?: (currency: string) => void;
  assetType?: AssetType;
}

export function SymbolSearchDialog({
  open,
  onOpenChange,
  value,
  onDone,
  onCurrencyHint,
  assetType,
}: SymbolSearchDialogProps): React.ReactElement {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SymbolSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<SymbolMap>(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Reset pending state when dialog opens
  function handleOpenChange(v: boolean): void {
    if (v) {
      setPending(value);
      setQuery("");
      setResults([]);
    }
    onOpenChange(v);
  }

  function handleDone(): void {
    onDone(pending);
    onOpenChange(false);
    setQuery("");
    setResults([]);
  }

  const doSearch = useCallback(
    async (q: string): Promise<void> => {
      if (q.trim().length < 2) {
        setResults([]);
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setResults([]);

      const params = new URLSearchParams({ query: q.trim() });
      if (assetType) params.set("assetType", assetType);

      try {
        const res = await fetch(`/api/financial/search-symbol?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok || !res.body) return;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value: chunk } = await reader.read();
          if (done) break;

          buffer += decoder.decode(chunk, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            const lines = part.split("\n");
            const eventLine = lines.find((l) => l.startsWith("event: "));
            const dataLine = lines.find((l) => l.startsWith("data: "));
            if (!eventLine || !dataLine) continue;

            const eventType = eventLine.slice(7);
            if (eventType === "done") break;
            if (eventType !== "results") continue;

            const payload = JSON.parse(dataLine.slice(6)) as {
              provider: string;
              results: SymbolSearchResult[];
            };
            setResults((prev) => [...prev, ...payload.results]);
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      } finally {
        setLoading(false);
      }
    },
    [assetType]
  );

  function handleInputChange(val: string): void {
    setQuery(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void doSearch(val), DEBOUNCE_MS);
  }

  function toggleResult(result: SymbolSearchResult): void {
    const next = { ...pending };
    if (next[result.provider] === result.symbol) {
      delete next[result.provider];
    } else {
      next[result.provider] = result.symbol;
      // Pre-fill the asset form's currency field on the *first* selection.
      // Cross-listed instruments (SHEL on LSE in GBP vs NYSE in USD) mean the
      // user can still override.
      if (result.currency && onCurrencyHint) {
        onCurrencyHint(result.currency);
      }
    }
    setPending(next);
  }

  const grouped = groupByProvider(results);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Search Symbols</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="text-muted-foreground absolute top-2.5 left-3 size-4" />
          <Input
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="Search by name or symbol…"
            className="pl-9"
            autoFocus
          />
          {loading && (
            <Loader2 className="text-muted-foreground absolute top-2.5 right-3 size-4 animate-spin" />
          )}
        </div>

        <div
          data-testid="symbol-search-results"
          className="border-border max-h-64 overflow-y-auto rounded-md border"
        >
          {results.length === 0 && !loading && query.length >= 2 && (
            <p className="text-muted-foreground p-4 text-center text-sm">No results found.</p>
          )}
          {results.length === 0 && !loading && query.length < 2 && (
            <p className="text-muted-foreground p-4 text-center text-sm">
              Type at least 2 characters to search. You can select from multiple providers for
              better reliability.
            </p>
          )}
          {[...grouped.entries()].map(([provider, items]) => (
            <div key={provider}>
              <div className="text-muted-foreground bg-muted/50 px-3 py-1.5 text-xs font-medium">
                {PROVIDER_LABELS[provider as keyof typeof PROVIDER_LABELS] ?? provider}
              </div>
              {items.map((item) => {
                const isSelected = pending[item.provider] === item.symbol;
                return (
                  <button
                    key={`${item.provider}-${item.symbol}`}
                    type="button"
                    className={`hover:bg-accent flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                      isSelected ? "bg-accent/50 font-medium" : ""
                    }`}
                    onClick={() => toggleResult(item)}
                  >
                    <span
                      className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
                        isSelected ? "border-primary" : "border-muted-foreground/30"
                      }`}
                    >
                      {isSelected && <span className="bg-primary size-2 rounded-full" />}
                    </span>
                    <span className="min-w-0 truncate">{item.name}</span>
                    {item.currency && (
                      <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                        {item.currency}
                      </span>
                    )}
                    {item.type && (
                      <Badge
                        variant="secondary"
                        className={`shrink-0 text-xs ${item.currency ? "" : "ml-auto"}`}
                      >
                        {item.type}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleDone}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Form Field (for use inside asset form dialogs) ─────────────────────────

/**
 * A form-field-style component: shows selected symbol pills with remove buttons,
 * plus a link to open the search dialog. Used inside asset creation/edit forms.
 */
export function SymbolSearch({
  value,
  onChange,
  onCurrencyHint,
  disabled,
  assetType,
}: SymbolSearchProps): React.ReactElement {
  const [dialogOpen, setDialogOpen] = useState(false);
  const entries = Object.entries(value);

  function removeEntry(provider: string): void {
    const next = { ...value };
    delete next[provider];
    onChange(next);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {entries.map(([provider, symbol]) => (
          <span
            key={provider}
            className="bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs"
          >
            <span className="text-muted-foreground">
              {PROVIDER_LABELS[provider as keyof typeof PROVIDER_LABELS] ?? provider}:
            </span>
            <span className="font-medium">{symbol}</span>
            <button
              type="button"
              onClick={() => removeEntry(provider)}
              className="hover:text-destructive relative ml-0.5 after:absolute after:-inset-2"
              disabled={disabled}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => setDialogOpen(true)}
          className="text-muted-foreground"
        >
          <Plus className="size-3" />
          Add
        </Button>
      </div>

      <SymbolSearchDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        value={value}
        onDone={onChange}
        onCurrencyHint={onCurrencyHint}
        assetType={assetType}
      />
    </div>
  );
}
