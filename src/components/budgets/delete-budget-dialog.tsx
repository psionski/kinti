"use client";

import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { formatCurrency } from "@/lib/format";
import type { BudgetStatusItem } from "@/lib/validators/reports";

interface DeleteBudgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budget: BudgetStatusItem | null;
  onConfirm: () => void;
  loading?: boolean;
  /** Why the last attempt failed, if it did. */
  error?: string | null;
}

export function DeleteBudgetDialog({
  open,
  onOpenChange,
  budget,
  onConfirm,
  loading,
  error,
}: DeleteBudgetDialogProps): React.ReactElement {
  return (
    <ConfirmDeleteDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete Budget"
      description={
        <>
          Are you sure you want to delete the budget for <strong>{budget?.categoryName}</strong>?
        </>
      }
      onConfirm={onConfirm}
      loading={loading}
      error={error}
    >
      {budget && (
        <p>
          Budget of <strong>{formatCurrency(budget.budgetAmount)}</strong> will be removed.
        </p>
      )}
    </ConfirmDeleteDialog>
  );
}
