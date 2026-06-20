"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Pencil,
  List,
  Merge,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import type { CategoryWithCountResponse } from "@/lib/validators/categories";
import type { BudgetStatsItem } from "@/lib/validators/reports";

interface CategoryTreeProps {
  categories: CategoryWithCountResponse[];
  stats: BudgetStatsItem[];
  onEdit: (category: CategoryWithCountResponse) => void;
  onMerge: (category: CategoryWithCountResponse) => void;
  onDelete: (category: CategoryWithCountResponse) => void;
}

interface TreeNode {
  category: CategoryWithCountResponse;
  children: TreeNode[];
}

function buildTree(categories: CategoryWithCountResponse[]): TreeNode[] {
  const map = new Map<number, TreeNode>();
  const roots: TreeNode[] = [];

  for (const cat of categories) {
    map.set(cat.id, { category: cat, children: [] });
  }

  for (const cat of categories) {
    const node = map.get(cat.id)!;
    if (cat.parentId !== null && map.has(cat.parentId)) {
      map.get(cat.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort alphabetically at each level
  const sortNodes = (nodes: TreeNode[]): void => {
    nodes.sort((a, b) => a.category.name.localeCompare(b.category.name));
    for (const node of nodes) sortNodes(node.children);
  };
  sortNodes(roots);

  return roots;
}

function formatAmount(amount: number): string {
  return amount.toFixed(2);
}

function BudgetBar({ spent, budget }: { spent: number; budget: number }): React.ReactElement {
  const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
  const color = pct < 60 ? "bg-green-500" : pct < 90 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <div className="bg-muted h-2 w-20 overflow-hidden rounded-full">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-muted-foreground text-xs">
        {formatAmount(spent)} / {formatAmount(budget)}
      </span>
    </div>
  );
}

function CategoryRow({
  node,
  depth,
  stats,
  expanded,
  onToggle,
  onEdit,
  onMerge,
  onDelete,
}: {
  node: TreeNode;
  depth: number;
  stats: Map<number, BudgetStatsItem>;
  expanded: Set<number>;
  onToggle: (id: number) => void;
  onEdit: (category: CategoryWithCountResponse) => void;
  onMerge: (category: CategoryWithCountResponse) => void;
  onDelete: (category: CategoryWithCountResponse) => void;
}): React.ReactElement {
  const cat = node.category;
  const catStats = stats.get(cat.id);
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(cat.id);

  return (
    <>
      <TableRow
        data-testid={`category-row-${cat.id}`}
        className="cursor-pointer"
        onClick={() => onEdit(cat)}
      >
        {/* Name with indent + expand/collapse */}
        <TableCell className="py-2 pr-2" style={{ paddingLeft: `${depth * 24 + 8}px` }}>
          <div className="flex items-center gap-1.5">
            {hasChildren ? (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(cat.id);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                {isExpanded ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
              </Button>
            ) : (
              <span className="w-5 shrink-0" />
            )}
            {cat.color && (
              <span
                className="inline-block size-3 shrink-0 rounded-full"
                style={{ backgroundColor: cat.color }}
              />
            )}
            {cat.icon && <span className="shrink-0 text-sm">{cat.icon}</span>}
            <span className="truncate font-medium">{cat.name}</span>
          </div>
        </TableCell>

        {/* Transaction count — all-time rollup for parents, own count for leaves */}
        <TableCell className="text-muted-foreground hidden text-right text-sm tabular-nums md:table-cell">
          {catStats?.rollupCount ?? cat.transactionCount}
        </TableCell>

        {/* Current month spend — show rollup for parents */}
        <TableCell className="text-muted-foreground text-right text-sm tabular-nums">
          {catStats && (hasChildren ? catStats.rollupTotal : catStats.total) > 0
            ? `€${formatAmount(hasChildren ? catStats.rollupTotal : catStats.total)}`
            : "—"}
        </TableCell>

        {/* Budget status — use rollup spend vs budget (includes child category spend) */}
        <TableCell className="hidden md:table-cell">
          {catStats?.budgetAmount ? (
            <BudgetBar spent={catStats.rollupTotal} budget={catStats.budgetAmount} />
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          )}
        </TableCell>

        {/* Actions */}
        <TableCell className="pr-3 text-right" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                data-testid={`category-actions-${cat.id}`}
                aria-label="Category actions"
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(cat)}>
                <Pencil className="size-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/transactions?categoryId=${cat.id}`}>
                  <List className="size-4" />
                  View Transactions
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onMerge(cat)}>
                <Merge className="size-4" />
                Merge into...
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(cat)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>

      {/* Render children if expanded */}
      {isExpanded &&
        node.children.map((child) => (
          <CategoryRow
            key={child.category.id}
            node={child}
            depth={depth + 1}
            stats={stats}
            expanded={expanded}
            onToggle={onToggle}
            onEdit={onEdit}
            onMerge={onMerge}
            onDelete={onDelete}
          />
        ))}
    </>
  );
}

export function CategoryTree({
  categories,
  stats,
  onEdit,
  onMerge,
  onDelete,
}: CategoryTreeProps): React.ReactElement {
  const tree = buildTree(categories);
  const statsMap = new Map(
    stats.filter((s) => s.categoryId !== null).map((s) => [s.categoryId!, s])
  );

  // Expand all parent categories. Keyed on categories so it reinitializes
  // when the list changes (e.g. after creating a child category).
  const parentKey = categories
    .filter((c) => categories.some((ch) => ch.parentId === c.id))
    .map((c) => c.id)
    .join(",");

  const [expanded, setExpanded] = useState<Set<number>>(() => {
    const ids = new Set<number>();
    for (const cat of categories) {
      if (categories.some((c) => c.parentId === cat.id)) {
        ids.add(cat.id);
      }
    }
    return ids;
  });
  const [prevParentKey, setPrevParentKey] = useState(parentKey);

  if (parentKey !== prevParentKey) {
    setPrevParentKey(parentKey);
    const ids = new Set<number>();
    for (const cat of categories) {
      if (categories.some((c) => c.parentId === cat.id)) {
        ids.add(cat.id);
      }
    }
    // Merge with existing expanded state (don't collapse manually collapsed parents)
    setExpanded((prev) => new Set([...prev, ...ids]));
  }

  function handleToggle(id: number): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (categories.length === 0) {
    return (
      <EmptyState
        message="No categories yet."
        description="Create your first category to start organizing transactions."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Category</TableHead>
          <TableHead className="hidden text-right md:table-cell">Transactions</TableHead>
          <TableHead className="text-right">This Month</TableHead>
          <TableHead className="hidden md:table-cell">Budget</TableHead>
          <TableHead className="w-[50px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {tree.map((node) => (
          <CategoryRow
            key={node.category.id}
            node={node}
            depth={0}
            stats={statsMap}
            expanded={expanded}
            onToggle={handleToggle}
            onEdit={onEdit}
            onMerge={onMerge}
            onDelete={onDelete}
          />
        ))}
      </TableBody>
    </Table>
  );
}
