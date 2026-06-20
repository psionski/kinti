"use client";

import { useState, useCallback } from "react";
import { Temporal } from "@js-temporal/polyfill";
import { ChevronLeft, ChevronRight, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { BudgetTable } from "./budget-table";
import { BudgetFormDialog } from "./budget-form-dialog";
import { DeleteBudgetDialog } from "./delete-budget-dialog";
import { formatMonth } from "@/lib/format";
import type { BudgetStatusItem } from "@/lib/validators/reports";
import type { BudgetStatusResponse } from "@/lib/validators/budgets";
import type { CategoryWithCountResponse } from "@/lib/validators/categories";

interface BudgetsClientProps {
  initialBudgetStatus: BudgetStatusItem[];
  initialInheritedFrom: string | null;
  initialCategories: CategoryWithCountResponse[];
  currentMonth: string;
}

function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  // Pure arithmetic: handle month overflow/underflow
  const totalMonths = year * 12 + (m - 1) + delta;
  const newYear = Math.floor(totalMonths / 12);
  const newMonth = (totalMonths % 12) + 1;
  return `${newYear}-${String(newMonth).padStart(2, "0")}`;
}

function formatMonthLabel(month: string): string {
  return Temporal.PlainYearMonth.from(month)
    .toPlainDate({ day: 1 })
    .toLocaleString("default", { month: "long", year: "numeric" });
}

export function BudgetsClient({
  initialBudgetStatus,
  initialInheritedFrom,
  initialCategories,
  currentMonth,
}: BudgetsClientProps): React.ReactElement {
  const [month, setMonth] = useState(currentMonth);
  const [budgetStatus, setBudgetStatus] = useState(initialBudgetStatus);
  const [inheritedFrom, setInheritedFrom] = useState(initialInheritedFrom);
  const [categories] = useState(initialCategories);
  const [loading, setLoading] = useState(false);

  // Dialog states
  const [showForm, setShowForm] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetStatusItem | null>(null);
  const [deletingBudget, setDeletingBudget] = useState<BudgetStatusItem | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const refresh = useCallback(async (m: string): Promise<void> => {
    setLoading(true);
    try {
      const res = await fetch(`/api/budgets?month=${m}`);
      if (res.ok) {
        const data = (await res.json()) as BudgetStatusResponse;
        setBudgetStatus(data.items);
        setInheritedFrom(data.inheritedFrom);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  function navigateMonth(delta: number): void {
    const newMonth = shiftMonth(month, delta);
    setMonth(newMonth);
    void refresh(newMonth);
  }

  async function handleSetBudget(data: {
    categoryId: number;
    month: string;
    amount: number;
  }): Promise<void> {
    setFormLoading(true);
    try {
      const res = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setShowForm(false);
        setEditingBudget(null);
        void refresh(month);
      }
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!deletingBudget) return;
    setFormLoading(true);
    try {
      const params = new URLSearchParams({
        categoryId: String(deletingBudget.categoryId),
        month,
      });
      const res = await fetch(`/api/budgets?${params}`, { method: "DELETE" });
      if (res.ok) {
        setDeletingBudget(null);
        void refresh(month);
      }
    } finally {
      setFormLoading(false);
    }
  }

  async function handleResetToInherited(): Promise<void> {
    setLoading(true);
    try {
      const res = await fetch("/api/budgets/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      });
      if (res.ok) {
        void refresh(month);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader title="Budgets">
        {inheritedFrom === null && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleResetToInherited()}
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
        {inheritedFrom !== null && (
          <span className="text-muted-foreground text-sm">
            Inherited from {formatMonthLabel(inheritedFrom)}
          </span>
        )}
      </div>

      {/* Budget table */}
      <div data-tour="budget-table" className={loading ? "pointer-events-none opacity-60" : ""}>
        <BudgetTable
          budgets={budgetStatus}
          onEdit={setEditingBudget}
          onDelete={setDeletingBudget}
        />
      </div>

      {/* Create dialog */}
      <BudgetFormDialog
        key={String(showForm)}
        open={showForm}
        onOpenChange={setShowForm}
        categories={categories}
        currentMonth={month}
        onSubmit={(d) => void handleSetBudget(d)}
        loading={formLoading}
      />

      {/* Edit dialog */}
      <BudgetFormDialog
        key={editingBudget?.categoryId ?? "new"}
        open={!!editingBudget}
        onOpenChange={(open) => {
          if (!open) setEditingBudget(null);
        }}
        categories={categories}
        currentMonth={month}
        onSubmit={(d) => void handleSetBudget(d)}
        initialData={editingBudget}
        loading={formLoading}
      />

      {/* Delete dialog */}
      <DeleteBudgetDialog
        open={!!deletingBudget}
        onOpenChange={(open) => {
          if (!open) setDeletingBudget(null);
        }}
        budget={deletingBudget}
        onConfirm={() => void handleDelete()}
        loading={formLoading}
      />
    </div>
  );
}
