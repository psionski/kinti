"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Temporal } from "@js-temporal/polyfill";
import { ChevronLeft, ChevronRight, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { BudgetTable } from "./budget-table";
import { BudgetFormDialog, type BudgetFormData } from "./budget-form-dialog";
import { DeleteBudgetDialog } from "./delete-budget-dialog";
import { formatMonth } from "@/lib/format";
import {
  budgetStatusQuery,
  useDeleteBudget,
  useResetBudgets,
  useSetBudget,
} from "@/lib/queries/budgets";
import { categoryListQuery } from "@/lib/queries/categories";
import type { BudgetStatusItem } from "@/lib/validators/reports";
import { resetOnClose } from "@/components/shared/reset-on-close";

interface BudgetsClientProps {
  /** The month the page opens on (`YYYY-MM`). */
  currentMonth: string;
}

function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  // Pure arithmetic: handle month overflow/underflow
  const totalMonths = year! * 12 + (m! - 1) + delta;
  const newYear = Math.floor(totalMonths / 12);
  const newMonth = (totalMonths % 12) + 1;
  return `${newYear}-${String(newMonth).padStart(2, "0")}`;
}

function formatMonthLabel(month: string): string {
  return Temporal.PlainYearMonth.from(month)
    .toPlainDate({ day: 1 })
    .toLocaleString("default", { month: "long", year: "numeric" });
}

export function BudgetsClient({ currentMonth }: BudgetsClientProps): React.ReactElement {
  const [month, setMonth] = useState(currentMonth);

  // Dialog states
  const [showForm, setShowForm] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetStatusItem | null>(null);
  const [deletingBudget, setDeletingBudget] = useState<BudgetStatusItem | null>(null);

  // While another month loads, the one before it stays on screen, dimmed.
  const status = useQuery({ ...budgetStatusQuery({ month }), placeholderData: keepPreviousData });
  const inheritedFrom = status.data?.inheritedFrom;
  const categories = useQuery(categoryListQuery()).data ?? [];

  const createBudget = useSetBudget();
  const editBudget = useSetBudget();
  const deleteBudget = useDeleteBudget();
  const resetBudgets = useResetBudgets();

  const loading = status.isPlaceholderData || status.isPending || resetBudgets.isPending;

  function navigateMonth(delta: number): void {
    setMonth((m) => shiftMonth(m, delta));
    // A failed reset belongs to the month it was tried on.
    resetBudgets.reset();
  }

  function handleCreate(data: BudgetFormData): void {
    createBudget.mutate(data, { onSuccess: () => setShowForm(false) });
  }

  function handleEdit(data: BudgetFormData): void {
    editBudget.mutate(data, { onSuccess: () => setEditingBudget(null) });
  }

  function handleDelete(): void {
    if (!deletingBudget) return;
    deleteBudget.mutate(
      { categoryId: deletingBudget.categoryId, month },
      { onSuccess: () => setDeletingBudget(null) }
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader title="Budgets">
        {inheritedFrom === null && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => resetBudgets.mutate({ month })}
            disabled={loading}
          >
            <RotateCcw className="size-4" />
            Reset to inherited
          </Button>
        )}
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="size-4" />
          Add Budget
        </Button>
      </PageHeader>

      {/* Month navigator */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => navigateMonth(-1)}
          data-testid="budget-prev-month"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-lg font-semibold" data-testid="budget-month-label">
          {formatMonth(month)}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => navigateMonth(1)}
          data-testid="budget-next-month"
        >
          <ChevronRight className="size-4" />
        </Button>
        {inheritedFrom && (
          <span className={`text-muted-foreground text-sm ${loading ? "opacity-60" : ""}`}>
            Inherited from {formatMonthLabel(inheritedFrom)}
          </span>
        )}
      </div>

      {status.isError && (
        <p className="text-destructive text-sm">
          Couldn&apos;t load budgets: {status.error.message}
        </p>
      )}
      {resetBudgets.isError && (
        <p className="text-destructive text-sm">
          Couldn&apos;t reset budgets: {resetBudgets.error.message}
        </p>
      )}

      {/* Budget table */}
      <div data-tour="budget-table" className={loading ? "pointer-events-none opacity-60" : ""}>
        <BudgetTable
          budgets={status.data?.items ?? []}
          onEdit={setEditingBudget}
          onDelete={setDeletingBudget}
        />
      </div>

      {/* Create dialog */}
      <BudgetFormDialog
        key={`create-${showForm}`}
        open={showForm}
        onOpenChange={resetOnClose(() => setShowForm(false), createBudget)}
        categories={categories}
        currentMonth={month}
        onSubmit={handleCreate}
        loading={createBudget.isPending}
        submitError={createBudget.error?.message}
      />

      {/* Edit dialog */}
      <BudgetFormDialog
        key={`edit-${editingBudget?.categoryId ?? "none"}`}
        open={!!editingBudget}
        onOpenChange={resetOnClose(() => setEditingBudget(null), editBudget)}
        categories={categories}
        currentMonth={month}
        onSubmit={handleEdit}
        initialData={editingBudget}
        loading={editBudget.isPending}
        submitError={editBudget.error?.message}
      />

      {/* Delete dialog */}
      <DeleteBudgetDialog
        open={!!deletingBudget}
        onOpenChange={resetOnClose(() => setDeletingBudget(null), deleteBudget)}
        budget={deletingBudget}
        onConfirm={handleDelete}
        loading={deleteBudget.isPending}
        error={deleteBudget.error?.message}
      />
    </div>
  );
}
