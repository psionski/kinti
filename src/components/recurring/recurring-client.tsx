"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { RecurringTable } from "./recurring-table";
import { RecurringFormDialog, type RecurringFormData } from "./recurring-form-dialog";
import { DeleteRecurringDialog } from "./delete-recurring-dialog";
import { toCreateRecurringBody, toUpdateRecurringBody } from "./recurring-request";
import {
  recurringListQuery,
  useCreateRecurring,
  useDeleteRecurring,
  useUpdateRecurring,
} from "@/lib/queries/recurring";
import { categoryListQuery } from "@/lib/queries/categories";
import type { RecurringResponse } from "@/lib/validators/recurring";
import type { CategoryWithCountResponse } from "@/lib/validators/categories";
import { resetOnClose } from "@/components/shared/reset-on-close";

export function RecurringClient(): React.ReactElement {
  // Dialog states
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<RecurringResponse | null>(null);
  const [deletingItem, setDeletingItem] = useState<RecurringResponse | null>(null);

  const list = useQuery(recurringListQuery());
  const categories = useQuery(categoryListQuery()).data ?? [];
  const categoryMap = new Map<number, CategoryWithCountResponse>(categories.map((c) => [c.id, c]));

  const createRecurring = useCreateRecurring();
  const updateRecurring = useUpdateRecurring();
  // Pausing has no dialog of its own, so it keeps its error apart from the edit form's.
  const toggleRecurring = useUpdateRecurring();
  const deleteRecurring = useDeleteRecurring();

  function handleCreate(data: RecurringFormData): void {
    createRecurring.mutate(toCreateRecurringBody(data), { onSuccess: () => setShowForm(false) });
  }

  function handleUpdate(data: RecurringFormData): void {
    if (!editingItem) return;
    updateRecurring.mutate(
      { id: editingItem.id, ...toUpdateRecurringBody(data) },
      { onSuccess: () => setEditingItem(null) }
    );
  }

  function handleToggleActive(item: RecurringResponse): void {
    toggleRecurring.mutate({ id: item.id, isActive: item.isActive === 0 });
  }

  function handleDelete(): void {
    if (!deletingItem) return;
    deleteRecurring.mutate(deletingItem.id, { onSuccess: () => setDeletingItem(null) });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader title="Recurring Transactions">
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="size-4" />
          Add Recurring
        </Button>
      </PageHeader>

      {list.isError && (
        <p className="text-destructive text-sm">
          Couldn&apos;t load recurring transactions: {list.error.message}
        </p>
      )}
      {toggleRecurring.isError && (
        <p className="text-destructive text-sm">
          Couldn&apos;t {toggleRecurring.variables.isActive ? "resume" : "pause"} the recurring
          transaction: {toggleRecurring.error.message}
        </p>
      )}

      {/* Table */}
      <div
        className={
          list.isPending || toggleRecurring.isPending ? "pointer-events-none opacity-60" : ""
        }
      >
        <RecurringTable
          items={list.data ?? []}
          categories={categoryMap}
          onEdit={setEditingItem}
          onDelete={setDeletingItem}
          onToggleActive={handleToggleActive}
        />
      </div>

      {/* Create dialog */}
      <RecurringFormDialog
        key={`create-${showForm}`}
        open={showForm}
        onOpenChange={resetOnClose(() => setShowForm(false), createRecurring)}
        categories={categories}
        onSubmit={handleCreate}
        loading={createRecurring.isPending}
        submitError={createRecurring.error?.message}
      />

      {/* Edit dialog */}
      <RecurringFormDialog
        key={`edit-${editingItem?.id ?? "none"}`}
        open={!!editingItem}
        onOpenChange={resetOnClose(() => setEditingItem(null), updateRecurring)}
        categories={categories}
        onSubmit={handleUpdate}
        initialData={editingItem}
        loading={updateRecurring.isPending}
        submitError={updateRecurring.error?.message}
      />

      {/* Delete dialog */}
      <DeleteRecurringDialog
        open={!!deletingItem}
        onOpenChange={resetOnClose(() => setDeletingItem(null), deleteRecurring)}
        item={deletingItem}
        onConfirm={handleDelete}
        loading={deleteRecurring.isPending}
        error={deleteRecurring.error?.message}
      />
    </div>
  );
}
