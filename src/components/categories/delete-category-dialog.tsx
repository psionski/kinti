"use client";

import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import type { CategoryWithCountResponse } from "@/lib/validators/categories";

interface DeleteCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: CategoryWithCountResponse | null;
  categories: CategoryWithCountResponse[];
  onConfirm: () => void;
  loading?: boolean;
  /** Why the last attempt failed, if it did. */
  error?: string | null;
}

export function DeleteCategoryDialog({
  open,
  onOpenChange,
  category,
  categories,
  onConfirm,
  loading,
  error,
}: DeleteCategoryDialogProps): React.ReactElement {
  const childCount = category ? categories.filter((c) => c.parentId === category.id).length : 0;

  return (
    <ConfirmDeleteDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete Category"
      description={
        <>
          Are you sure you want to delete <strong>{category?.name}</strong>?
        </>
      }
      onConfirm={onConfirm}
      loading={loading}
      error={error}
    >
      {category && category.transactionCount > 0 && (
        <p>
          <strong>{category.transactionCount}</strong> transaction(s) will become uncategorized.
        </p>
      )}
      {childCount > 0 && (
        <p>
          <strong>{childCount}</strong> child categor{childCount === 1 ? "y" : "ies"} will become
          top-level.
        </p>
      )}
    </ConfirmDeleteDialog>
  );
}
