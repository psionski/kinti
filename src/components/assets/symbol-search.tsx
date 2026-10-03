"use client";

import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { symbolSearchQuery } from "@/lib/queries/financial";
import type { SymbolSearchResult } from "@/lib/providers/types";
import type { AssetType } from "@/lib/validators/assets";

const MAX_PER_PROVIDER = 5;
const DEBOUNCE_MS = 300;

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Search Symbols</DialogTitle>
        </DialogHeader>
        {/* Mounted only while open, so every opening starts from `value` with
            an empty search. */}
        <SymbolSearchPanel
          value={value}
          onDone={(map) => {
            onDone(map);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
          onCurrencyHint={onCurrencyHint}
          assetType={assetType}
        />
      </DialogContent>
    </Dialog>
  );
}

interface SymbolSearchPanelProps {
  value: SymbolMap;
  onDone: (map: SymbolMap) => void;
  onCancel: () => void;
  onCurrencyHint?: (currency: string) => void;
  assetType?: AssetType;
}

function SymbolSearchPanel({
  value,
  onDone,
  onCancel,
  onCurrencyHint,
  assetType,
}: SymbolSearchPanelProps): React.ReactElement {
  const [query, setQuery] = useState("");
  // What is searched: the input once it stops changing.
  const [searchTerm, setSearchTerm] = useState("");
  const [pending, setPending] = useState<SymbolMap>(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const term = searchTerm.trim();
  // Each provider's matches appear as they arrive; `isFetching` holds until
  // the last provider has answered.
  const search = useQuery({
    ...symbolSearchQuery({ query: term, assetType }),
    enabled: term.length >= 2,
  });
  const results = search.data ?? [];
  const loading = search.isFetching;

  function handleInputChange(val: string): void {
    setQuery(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setSearchTerm(val), DEBOUNCE_MS);
  }

  function toggleResult(result: SymbolSearchResult): void {
    if (pending[result.provider] === result.symbol) {
      const next = Object.fromEntries(
        Object.entries(pending).filter(([provider]) => provider !== result.provider)
      );
      setPending(next);
    } else {
      // Pre-fill the asset form's currency field on the *first* selection.
      // Cross-listed instruments (SHEL on LSE in GBP vs NYSE in USD) mean the
      // user can still override.
      if (result.currency && onCurrencyHint) {
        onCurrencyHint(result.currency);
      }
      setPending({ ...pending, [result.provider]: result.symbol });
    }
  }

  const grouped = groupByProvider(results);

  return (
    <>
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
        {search.isError && (
          <p className="text-destructive p-4 text-center text-sm">{search.error.message}</p>
        )}
        {results.length === 0 && !loading && !search.isError && query.length >= 2 && (
          <p className="text-muted-foreground p-4 text-center text-sm">No results found.</p>
        )}
        {results.length === 0 && !loading && query.length < 2 && (
          <p className="text-muted-foreground p-4 text-center text-sm">
            Type at least 2 characters to search. You can select from multiple providers for better
            reliability.
          </p>
        )}
        {[...grouped.entries()].map(([provider, items]) => (
          <div key={provider}>
            <div className="text-muted-foreground bg-muted/50 px-3 py-1.5 text-xs font-medium">
              {(PROVIDER_LABELS as Record<string, string | undefined>)[provider] ?? provider}
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
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => onDone(pending)}>Done</Button>
      </DialogFooter>
    </>
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
    const next = Object.fromEntries(Object.entries(value).filter(([key]) => key !== provider));
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
              {(PROVIDER_LABELS as Record<string, string | undefined>)[provider] ?? provider}:
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
