"use client";

import { TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/format";
import type { RealizedPnlResult } from "@/lib/validators/portfolio-reports";

interface PnlSummaryProps {
  realizedPnl: RealizedPnlResult;
  unrealizedPnl: number | null;
}

function pnlColor(value: number): string {
  if (value > 0) return "text-emerald-600";
  if (value < 0) return "text-destructive";
  return "text-muted-foreground";
}

function PnlIcon({ value }: { value: number }): React.ReactElement | null {
  if (value > 0) return <TrendingUp className="size-5" />;
  if (value < 0) return <TrendingDown className="size-5" />;
  return null;
}

export function PnlSummary({ realizedPnl, unrealizedPnl }: PnlSummaryProps): React.ReactElement {
  const hasUnrealized = unrealizedPnl !== null && unrealizedPnl !== 0;
  const hasRealized = realizedPnl.totalRealizedPnl !== 0;
  const hasItems = realizedPnl.items.length > 0;
  const isEmpty = !hasUnrealized && !hasRealized && !hasItems;

  if (isEmpty) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Profit &amp; Loss</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            message="No profit or loss data available yet."
            description="P&L will appear once you have asset transactions with price history."
          />
        </CardContent>
      </Card>
    );
  }

  const unrealizedValue = unrealizedPnl ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profit &amp; Loss</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Unrealized P&amp;L</CardTitle>
              <PnlIcon value={unrealizedValue} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-semibold tabular-nums ${pnlColor(unrealizedValue)}`}>
                {unrealizedPnl !== null ? formatCurrency(unrealizedPnl) : "N/A"}
              </div>
              <p className="text-muted-foreground mt-1 text-xs">Current open positions</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Realized P&amp;L</CardTitle>
              <PnlIcon value={realizedPnl.totalRealizedPnl} />
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-semibold tabular-nums ${pnlColor(realizedPnl.totalRealizedPnl)}`}
              >
                {formatCurrency(realizedPnl.totalRealizedPnl)}
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                {formatCurrency(realizedPnl.totalProceeds)} proceeds &middot;{" "}
                {formatCurrency(realizedPnl.totalCostBasis)} cost basis
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Realized P&L breakdown table */}
        {hasItems && (
          <div>
            <h3 className="mb-3 text-sm font-medium">Realized P&amp;L by Asset</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Qty Sold</TableHead>
                  <TableHead className="text-right">Proceeds</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Cost Basis</TableHead>
                  <TableHead className="text-right">Realized P&amp;L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {realizedPnl.items.map((item) => (
                  <TableRow key={item.assetId}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="hidden text-right md:table-cell">
                      {item.totalSold}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(item.proceeds)}</TableCell>
                    <TableCell className="hidden text-right md:table-cell">
                      {formatCurrency(item.costBasis)}
                    </TableCell>
                    <TableCell className={`text-right font-medium ${pnlColor(item.realizedPnl)}`}>
                      {formatCurrency(item.realizedPnl)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
