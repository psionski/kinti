"use client";

import Link from "next/link";
import { MoreHorizontal, Pencil, Trash2, List, Pause, Play } from "lucide-react";
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
import { formatCurrency, formatDate, formatFrequency } from "@/lib/format";
import type { RecurringResponse } from "@/lib/validators/recurring";
import type { CategoryWithCountResponse } from "@/lib/validators/categories";

interface RecurringTableProps {
  items: RecurringResponse[];
  categories: Map<number, CategoryWithCountResponse>;
  onEdit: (item: RecurringResponse) => void;
  onDelete: (item: RecurringResponse) => void;
  onToggleActive: (item: RecurringResponse) => void;
}

function statusBadge(item: RecurringResponse): React.ReactElement {
  if (item.isActive === 0) {
    return <Badge variant="secondary">Paused</Badge>;
  }
  if (item.endDate && item.nextOccurrence === null) {
    return <Badge variant="outline">Ended</Badge>;
  }
  return <Badge className="bg-emerald-600 text-white hover:bg-emerald-700">Active</Badge>;
}

export function RecurringTable({
  items,
  categories,
  onEdit,
  onDelete,
  onToggleActive,
}: RecurringTableProps): React.ReactElement {
  if (items.length === 0) {
    return <EmptyState message="No recurring transactions yet." />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Description</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="hidden md:table-cell">Category</TableHead>
          <TableHead className="hidden md:table-cell">Frequency</TableHead>
          <TableHead className="hidden md:table-cell">Next</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-[50px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const category = item.categoryId ? categories.get(item.categoryId) : null;

          return (
            <TableRow
              key={item.id}
              data-testid={`recurring-row-${item.id}`}
              className="cursor-pointer"
              onClick={() => onEdit(item)}
            >
              <TableCell>
                <div className="font-medium">{item.description}</div>
                {item.merchant && (
                  <div className="text-muted-foreground text-xs">{item.merchant}</div>
                )}
              </TableCell>
              <TableCell className="text-right">
                <span
                  className={`tabular-nums ${
                    item.type === "income" ? "text-emerald-600" : "text-foreground"
                  }`}
                >
                  {formatCurrency(item.amount, item.currency)}
                </span>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {category ? (
                  <Badge variant="secondary">
                    {category.icon ? `${category.icon} ` : ""}
                    {category.name}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground text-sm">—</span>
                )}
              </TableCell>
              <TableCell className="hidden text-sm md:table-cell">
                {formatFrequency(item)}
              </TableCell>
              <TableCell className="hidden text-sm md:table-cell">
                {item.nextOccurrence ? formatDate(item.nextOccurrence) : "—"}
              </TableCell>
              <TableCell>{statusBadge(item)}</TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      data-testid={`recurring-actions-${item.id}`}
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(item)}>
                      <Pencil className="mr-2 size-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/transactions?recurringId=${item.id}`}>
                        <List className="mr-2 size-4" />
                        View Transactions
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onToggleActive(item)}>
                      {item.isActive ? (
                        <>
                          <Pause className="mr-2 size-4" />
                          Pause
                        </>
                      ) : (
                        <>
                          <Play className="mr-2 size-4" />
                          Resume
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={() => onDelete(item)}>
                      <Trash2 className="mr-2 size-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
