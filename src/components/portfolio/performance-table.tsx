"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency, getBaseCurrency } from "@/lib/format";
import type { AssetPerformanceItem } from "@/lib/validators/portfolio-reports";

type SortKey = keyof Pick<
  AssetPerformanceItem,
  | "name"
  | "costBasisBase"
  | "currentValueBase"
  | "pnlBase"
  | "pnlPct"
  | "annualizedReturn"
  | "daysHeld"
>;

type SortDir = "asc" | "desc";

interface PerformanceTableProps {
  data: AssetPerformanceItem[];
}

function formatPct(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function formatPnlCurrency(amount: number): string {
  const sign = amount >= 0 ? "+" : "";
  return `${sign}${formatCurrency(amount)}`;
}

function pnlColor(value: number): string {
  if (value > 0) return "text-emerald-600";
  if (value < 0) return "text-destructive";
  return "";
}

function sortItems(
  items: AssetPerformanceItem[],
  key: SortKey,
  dir: SortDir
): AssetPerformanceItem[] {
  return [...items].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];

    // nulls sort last regardless of direction
    if (aVal === null && bVal === null) return 0;
    if (aVal === null) return 1;
    if (bVal === null) return -1;

    let cmp: number;
    if (typeof aVal === "string" && typeof bVal === "string") {
      cmp = aVal.localeCompare(bVal);
    } else {
      cmp = (aVal as number) - (bVal as number);
    }

    return dir === "asc" ? cmp : -cmp;
  });
}

function SortIcon({
  field,
  currentSort,
  currentDir,
}: {
  field: SortKey;
  currentSort: SortKey;
  currentDir: SortDir;
}): React.ReactElement {
  if (field !== currentSort) {
    return <ArrowUpDown className="ml-1 inline size-3.5 opacity-40" />;
  }
  return currentDir === "asc" ? (
    <ArrowUp className="ml-1 inline size-3.5" />
  ) : (
    <ArrowDown className="ml-1 inline size-3.5" />
  );
}

export function PerformanceTable({ data }: PerformanceTableProps): React.ReactElement {
  const [sortKey, setSortKey] = useState<SortKey>("pnlBase");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const baseCurrency = getBaseCurrency();
  const hasMultiCurrency = data.some((d) => d.currency !== baseCurrency);

  function handleSort(key: SortKey): void {
    if (key === sortKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function renderSortableHeader(label: string, field: SortKey): React.ReactElement {
    return (
      <button
        type="button"
        className="hover:text-foreground inline-flex items-center"
        onClick={() => handleSort(field)}
      >
        {label}
        <SortIcon field={field} currentSort={sortKey} currentDir={sortDir} />
      </button>
    );
  }

  const sorted = sortItems(data, sortKey, sortDir);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyState message="No asset performance data available." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-muted-foreground px-2 py-2 text-left text-xs font-medium">
                    {renderSortableHeader("Asset", "name")}
                  </th>
                  <th className="text-muted-foreground hidden px-2 py-2 text-right text-xs font-medium md:table-cell">
                    {renderSortableHeader("Cost Basis", "costBasisBase")}
                  </th>
                  <th className="text-muted-foreground hidden px-2 py-2 text-right text-xs font-medium md:table-cell">
                    {renderSortableHeader("Current Value", "currentValueBase")}
                  </th>
                  <th className="text-muted-foreground px-2 py-2 text-right text-xs font-medium">
                    {renderSortableHeader("P&L", "pnlBase")}
                  </th>
                  <th className="text-muted-foreground px-2 py-2 text-right text-xs font-medium">
                    {renderSortableHeader("P&L (%)", "pnlPct")}
                  </th>
                  {hasMultiCurrency && (
                    <th className="text-muted-foreground hidden px-2 py-2 text-right text-xs font-medium md:table-cell">
                      FX Effect
                    </th>
                  )}
                  <th className="text-muted-foreground hidden px-2 py-2 text-right text-xs font-medium md:table-cell">
                    {renderSortableHeader("Ann. Return", "annualizedReturn")}
                  </th>
                  <th className="text-muted-foreground hidden px-2 py-2 text-right text-xs font-medium md:table-cell">
                    {renderSortableHeader("Days Held", "daysHeld")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((item) => {
                  const isForeign = item.currency !== baseCurrency;
                  const nativePnl = `${item.pnl >= 0 ? "+" : ""}${formatCurrency(item.pnl, item.currency)}`;
                  return (
                    <tr key={item.assetId} className="border-b">
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/assets/${item.assetId}`}
                            className="text-foreground font-medium hover:underline"
                          >
                            {item.name}
                          </Link>
                          <Badge variant="secondary">{item.type}</Badge>
                          {isForeign && (
                            <Badge variant="outline" className="text-xs">
                              {item.currency}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td
                        className="hidden px-2 py-2 text-right md:table-cell"
                        title={
                          isForeign
                            ? `Native: ${formatCurrency(item.costBasis, item.currency)}`
                            : undefined
                        }
                      >
                        {formatCurrency(item.costBasisBase)}
                      </td>
                      <td
                        className="hidden px-2 py-2 text-right md:table-cell"
                        title={
                          isForeign
                            ? `Native: ${formatCurrency(item.currentValue, item.currency)}`
                            : undefined
                        }
                      >
                        {item.currentValueBase !== null
                          ? formatCurrency(item.currentValueBase)
                          : "—"}
                      </td>
                      <td
                        className={`px-2 py-2 text-right font-medium ${item.pnlBase !== null ? pnlColor(item.pnlBase) : ""}`}
                        title={isForeign ? `Native: ${nativePnl}` : undefined}
                      >
                        {item.pnlBase !== null ? formatPnlCurrency(item.pnlBase) : "—"}
                      </td>
                      <td className={`px-2 py-2 text-right font-medium ${pnlColor(item.pnlPct)}`}>
                        {formatPct(item.pnlPct)}
                      </td>
                      {hasMultiCurrency && (
                        <td
                          className={`hidden px-2 py-2 text-right md:table-cell ${item.fxPnlBase !== null ? pnlColor(item.fxPnlBase) : ""}`}
                          title={
                            item.pricePnlBase !== null
                              ? `Price: ${formatPnlCurrency(item.pricePnlBase)}, FX: ${item.fxPnlBase !== null ? formatPnlCurrency(item.fxPnlBase) : "—"}`
                              : undefined
                          }
                        >
                          {item.fxPnlBase !== null && item.fxPnlBase !== 0
                            ? formatPnlCurrency(item.fxPnlBase)
                            : "—"}
                        </td>
                      )}
                      <td
                        className={`hidden px-2 py-2 text-right md:table-cell ${item.annualizedReturn !== null ? pnlColor(item.annualizedReturn) : ""}`}
                      >
                        {item.annualizedReturn !== null ? formatPct(item.annualizedReturn) : "—"}
                      </td>
                      <td className="hidden px-2 py-2 text-right md:table-cell">{item.daysHeld}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
