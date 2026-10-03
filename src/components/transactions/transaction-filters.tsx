"use client";

import { useState } from "react";
import { Repeat, Search, SlidersHorizontal, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { CategorySelectItems } from "@/components/categories/category-select-items";
import type { CategoryWithCountResponse } from "@/lib/validators/categories";
import { EMPTY_FILTERS, type TransactionFilters } from "./transaction-query";

// "Expenses" keeps refunds, which are expense rows; "Refunds" narrows to them alone.
const TYPE_FILTER_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "expense", label: "Expenses" },
  { value: "refund", label: "Refunds" },
  { value: "income", label: "Income" },
] as const;

function TypeFilterItems(): React.ReactElement {
  return (
    <>
      {TYPE_FILTER_OPTIONS.map((o) => (
        <SelectItem key={o.value} value={o.value}>
          {o.label}
        </SelectItem>
      ))}
    </>
  );
}

interface TransactionFilterBarProps {
  filters: TransactionFilters;
  categories: CategoryWithCountResponse[];
  onFiltersChange: (filters: TransactionFilters) => void;
  /** What the recurring-template badge calls the template the filter names. */
  recurringLabel: string;
}

/** Vertical filter controls rendered inside the mobile Sheet. */
function SheetFilterControls({
  filters,
  categories,
  onFiltersChange,
}: {
  filters: TransactionFilters;
  categories: CategoryWithCountResponse[];
  onFiltersChange: (filters: TransactionFilters) => void;
}): React.ReactElement {
  return (
    <div className="space-y-4">
      {/* Type */}
      <div className="space-y-1.5">
        <label className="text-muted-foreground text-sm">Type</label>
        <Select
          value={filters.type || "all"}
          onValueChange={(v) => onFiltersChange({ ...filters, type: v === "all" ? "" : v })}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <TypeFilterItems />
          </SelectContent>
        </Select>
      </div>

      {/* Category */}
      <div className="space-y-1.5">
        <label className="text-muted-foreground text-sm">Category</label>
        <Select
          value={filters.categoryId || "all"}
          onValueChange={(v) => onFiltersChange({ ...filters, categoryId: v === "all" ? "" : v })}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="uncategorized">Uncategorized</SelectItem>
            <CategorySelectItems categories={categories} />
          </SelectContent>
        </Select>
      </div>

      {/* Date range */}
      <div className="space-y-1.5">
        <label className="text-muted-foreground text-sm">Date range</label>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => onFiltersChange({ ...filters, dateFrom: e.target.value })}
            className="h-8 flex-1"
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="date"
            value={filters.dateTo}
            onChange={(e) => onFiltersChange({ ...filters, dateTo: e.target.value })}
            className="h-8 flex-1"
          />
        </div>
      </div>

      {/* Amount range */}
      <div className="space-y-1.5">
        <label className="text-muted-foreground text-sm">Amount range</label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            placeholder="Min"
            value={filters.amountMin}
            onChange={(e) => onFiltersChange({ ...filters, amountMin: e.target.value })}
            className="h-8 flex-1"
            min="0"
            step="0.01"
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="number"
            placeholder="Max"
            value={filters.amountMax}
            onChange={(e) => onFiltersChange({ ...filters, amountMax: e.target.value })}
            className="h-8 flex-1"
            min="0"
            step="0.01"
          />
        </div>
      </div>
    </div>
  );
}

export function TransactionFilterBar({
  filters,
  categories,
  onFiltersChange,
  recurringLabel,
}: TransactionFilterBarProps): React.ReactElement {
  const [searchInput, setSearchInput] = useState(filters.search);
  const [sheetOpen, setSheetOpen] = useState(false);
  const isMobile = useIsMobile();

  function handleSearchSubmit(): void {
    onFiltersChange({ ...filters, search: searchInput });
  }

  const activeFilterCount = [
    filters.type,
    filters.categoryId,
    filters.dateFrom,
    filters.dateTo,
    filters.amountMin,
    filters.amountMax,
  ].filter(Boolean).length;

  const hasActiveFilters = activeFilterCount > 0;

  function handleClearAll(): void {
    setSearchInput("");
    onFiltersChange(EMPTY_FILTERS);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Text search — always visible */}
        <div className="relative min-w-0 flex-1 sm:min-w-[200px]">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search transactions..."
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              onFiltersChange({ ...filters, search: e.target.value });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearchSubmit();
            }}
            className="h-8 pl-8"
          />
        </div>

        {isMobile ? (
          <>
            {/* Mobile: filter button with active count badge */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSheetOpen(true)}
              className="gap-1.5"
            >
              <SlidersHorizontal className="size-3.5" />
              Filters
              {hasActiveFilters && (
                <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-xs">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
            {(hasActiveFilters || filters.search) && (
              <Button variant="ghost" size="icon-xs" onClick={handleClearAll}>
                <X className="size-3.5" />
              </Button>
            )}
          </>
        ) : (
          <>
            {/* Desktop: inline type + category selects */}
            <Select
              value={filters.type || "all"}
              onValueChange={(v) => onFiltersChange({ ...filters, type: v === "all" ? "" : v })}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <TypeFilterItems />
              </SelectContent>
            </Select>

            <Select
              value={filters.categoryId || "all"}
              onValueChange={(v) =>
                onFiltersChange({ ...filters, categoryId: v === "all" ? "" : v })
              }
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="uncategorized">Uncategorized</SelectItem>
                <CategorySelectItems categories={categories} />
              </SelectContent>
            </Select>

            {(hasActiveFilters || filters.search) && (
              <Button variant="ghost" size="sm" onClick={handleClearAll}>
                <X className="size-3.5" />
                Clear
              </Button>
            )}
          </>
        )}
      </div>

      {/* Desktop: date and amount range row */}
      {!isMobile && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Date:</span>
          <Input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => onFiltersChange({ ...filters, dateFrom: e.target.value })}
            className="h-8 w-[150px]"
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="date"
            value={filters.dateTo}
            onChange={(e) => onFiltersChange({ ...filters, dateTo: e.target.value })}
            className="h-8 w-[150px]"
          />

          <span className="text-muted-foreground ml-2">Amount:</span>
          <Input
            type="number"
            placeholder="Min"
            value={filters.amountMin}
            onChange={(e) => onFiltersChange({ ...filters, amountMin: e.target.value })}
            className="h-8 w-[100px]"
            min="0"
            step="0.01"
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="number"
            placeholder="Max"
            value={filters.amountMax}
            onChange={(e) => onFiltersChange({ ...filters, amountMax: e.target.value })}
            className="h-8 w-[100px]"
            min="0"
            step="0.01"
          />
        </div>
      )}

      {/* Mobile filter sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto p-4">
          <SheetHeader className="px-0">
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <SheetFilterControls
            filters={filters}
            categories={categories}
            onFiltersChange={onFiltersChange}
          />
          <div className="mt-4 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => {
                onFiltersChange({
                  ...EMPTY_FILTERS,
                  search: filters.search,
                  recurringId: filters.recurringId,
                });
              }}
            >
              Clear all
            </Button>
            <Button size="sm" className="flex-1" onClick={() => setSheetOpen(false)}>
              Done
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Active filter badges. Shown whenever the filter is on, named or not,
          so it can always be cleared. */}
      {filters.recurringId && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1 py-1">
            <Repeat className="size-3" />
            Recurring: {recurringLabel}
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground hover:text-foreground ml-1"
              onClick={() => onFiltersChange({ ...filters, recurringId: "" })}
            >
              <X className="size-3" />
            </Button>
          </Badge>
        </div>
      )}
    </div>
  );
}
