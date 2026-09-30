"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { BudgetProgressBar } from "./budget-progress-bar";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { BudgetStatusItem } from "@/lib/validators/reports";

interface BudgetTableProps {
  budgets: BudgetStatusItem[];
  onEdit: (budget: BudgetStatusItem) => void;
  onDelete: (budget: BudgetStatusItem) => void;
}

function statusBadge(item: BudgetStatusItem): React.ReactElement {
  if (item.isOver) {
    return <Badge variant="destructive">Over budget</Badge>;
  }
  if (item.percentUsed >= 80) {
    return <Badge className="bg-yellow-500 text-white hover:bg-yellow-600">Approaching</Badge>;
  }
  return <Badge variant="secondary">On track</Badge>;
}

export function BudgetTable({ budgets, onEdit, onDelete }: BudgetTableProps): React.ReactElement {
  if (budgets.length === 0) {
    return <EmptyState message="No budgets set for this month." />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Category</TableHead>
          <TableHead className="min-w-[100px] md:w-[200px]">Progress</TableHead>
          <TableHead className="hidden text-right md:table-cell">Spent</TableHead>
          <TableHead className="hidden text-right md:table-cell">Budget</TableHead>
          <TableHead className="hidden text-right md:table-cell">Remaining</TableHead>
          <TableHead className="hidden md:table-cell">Status</TableHead>
          <TableHead className="w-[50px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {budgets.map((item) => (
          <TableRow
            key={item.categoryId}
            data-testid={`budget-row-${item.categoryId}`}
            className="cursor-pointer"
            onClick={() => onEdit(item)}
          >
            <TableCell className="font-medium">{item.categoryName}</TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <BudgetProgressBar percentUsed={item.percentUsed} className="flex-1" />
                <span className="text-muted-foreground w-12 text-right text-xs">
                  {/* Spent can go negative with refunds; the share used can't. */}
                  {formatPercent(Math.max(item.percentUsed, 0))}
                </span>
              </div>
            </TableCell>
            <TableCell className="hidden text-right md:table-cell">
              {formatCurrency(item.spentAmount)}
            </TableCell>
            <TableCell className="hidden text-right md:table-cell">
              {formatCurrency(item.budgetAmount)}
            </TableCell>
            <TableCell
              className={`hidden text-right md:table-cell ${item.isOver ? "text-destructive" : ""}`}
            >
              {formatCurrency(item.remainingAmount)}
            </TableCell>
            <TableCell className="hidden md:table-cell">{statusBadge(item)}</TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Budget actions"
                    data-testid={`budget-actions-${item.categoryId}`}
                  >
                    <MoreHorizontal className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(item)}>
                    <Pencil className="size-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onDelete(item)}
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
