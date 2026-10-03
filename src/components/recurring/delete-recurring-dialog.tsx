"use client";

import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { formatCurrency, formatFrequency } from "@/lib/format";
import type { RecurringResponse } from "@/lib/validators/recurring";

interface DeleteRecurringDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: RecurringResponse | null;
  onConfirm: () => void;
  loading?: boolean;
  /** Why the last attempt failed, if it did. */
  error?: string | null;
}

export function DeleteRecurringDialog({
  open,
  onOpenChange,
  item,
  onConfirm,
  loading,
  error,
}: DeleteRecurringDialogProps): React.ReactElement {
  return (
    <ConfirmDeleteDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete Recurring Transaction"
      description={
        <>
          Are you sure you want to delete <strong>{item?.description}</strong>?
        </>
      }
      onConfirm={onConfirm}
      loading={loading}
      error={error}
    >
      {item && (
        <p>
          This will remove the recurring template for{" "}
          <strong>{formatCurrency(item.amount, item.currency)}</strong> ({formatFrequency(item)}).
          Already-generated transactions will be kept.
        </p>
      )}
    </ConfirmDeleteDialog>
  );
}
