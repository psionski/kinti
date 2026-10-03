"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { CategoryTree } from "./category-tree";
import { CategoryFormDialog, type CategoryFormData } from "./category-form-dialog";
import { MergeCategoryDialog } from "./merge-category-dialog";
import { DeleteCategoryDialog } from "./delete-category-dialog";
import {
  categoryListQuery,
  useCreateCategory,
  useDeleteCategory,
  useMergeCategories,
  useUpdateCategory,
} from "@/lib/queries/categories";
import { budgetStatsQuery } from "@/lib/queries/budgets";
import type { CategoryWithCountResponse } from "@/lib/validators/categories";
import { resetOnClose } from "@/components/shared/reset-on-close";

interface CategoriesClientProps {
  /** The month whose spending and budgets the tree shows (`YYYY-MM`). */
  month: string;
}

export function CategoriesClient({ month }: CategoriesClientProps): React.ReactElement {
  // Dialog states
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryWithCountResponse | null>(null);
  const [mergingCategory, setMergingCategory] = useState<CategoryWithCountResponse | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<CategoryWithCountResponse | null>(null);

  const list = useQuery(categoryListQuery());
  const stats = useQuery(budgetStatsQuery({ month }));
  const categories = list.data ?? [];

  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const mergeCategories = useMergeCategories();
  const deleteCategory = useDeleteCategory();

  function handleCreate(data: CategoryFormData): void {
    createCategory.mutate(
      {
        name: data.name,
        parentId: data.parentId ?? undefined,
        icon: data.icon || undefined,
        color: data.color || undefined,
      },
      { onSuccess: () => setShowCreateForm(false) }
    );
  }

  function handleEdit(data: CategoryFormData): void {
    if (!editingCategory) return;
    // Emptied fields are sent as null so they clear.
    updateCategory.mutate(
      {
        id: editingCategory.id,
        name: data.name,
        parentId: data.parentId,
        icon: data.icon || null,
        color: data.color || null,
      },
      { onSuccess: () => setEditingCategory(null) }
    );
  }

  function handleMerge(targetCategoryId: number): void {
    if (!mergingCategory) return;
    mergeCategories.mutate(
      { sourceCategoryId: mergingCategory.id, targetCategoryId },
      { onSuccess: () => setMergingCategory(null) }
    );
  }

  function handleDelete(): void {
    if (!deletingCategory) return;
    deleteCategory.mutate(deletingCategory.id, { onSuccess: () => setDeletingCategory(null) });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader title="Categories">
        <Button onClick={() => setShowCreateForm(true)} size="sm">
          <Plus className="size-4" />
          Add Category
        </Button>
      </PageHeader>

      {list.isError && (
        <p className="text-destructive text-sm">
          Couldn&apos;t load categories: {list.error.message}
        </p>
      )}
      {stats.isError && (
        <p className="text-destructive text-sm">
          Couldn&apos;t load this month&apos;s spending: {stats.error.message}
        </p>
      )}

      {/* Tree */}
      <div
        data-tour="category-tree"
        className={list.isPending ? "pointer-events-none opacity-60" : ""}
      >
        <CategoryTree
          categories={categories}
          stats={stats.data?.items ?? []}
          onEdit={setEditingCategory}
          onMerge={setMergingCategory}
          onDelete={setDeletingCategory}
        />
      </div>

      {/* Create dialog. Keyed so each opening starts from an empty form. */}
      <CategoryFormDialog
        key={String(showCreateForm)}
        open={showCreateForm}
        onOpenChange={resetOnClose(() => setShowCreateForm(false), createCategory)}
        categories={categories}
        onSubmit={handleCreate}
        loading={createCategory.isPending}
        submitError={createCategory.error?.message}
      />

      {/* Edit dialog */}
      <CategoryFormDialog
        key={editingCategory?.id ?? "new"}
        open={!!editingCategory}
        onOpenChange={resetOnClose(() => setEditingCategory(null), updateCategory)}
        categories={categories}
        onSubmit={handleEdit}
        initialData={editingCategory}
        loading={updateCategory.isPending}
        submitError={updateCategory.error?.message}
      />

      {/* Merge dialog. Keyed by its source so no earlier target stays picked. */}
      <MergeCategoryDialog
        key={mergingCategory?.id ?? "none"}
        open={!!mergingCategory}
        onOpenChange={resetOnClose(() => setMergingCategory(null), mergeCategories)}
        sourceCategory={mergingCategory}
        categories={categories}
        onConfirm={handleMerge}
        loading={mergeCategories.isPending}
        error={mergeCategories.error?.message}
      />

      {/* Delete dialog */}
      <DeleteCategoryDialog
        open={!!deletingCategory}
        onOpenChange={resetOnClose(() => setDeletingCategory(null), deleteCategory)}
        category={deletingCategory}
        categories={categories}
        onConfirm={handleDelete}
        loading={deleteCategory.isPending}
        error={deleteCategory.error?.message}
      />
    </div>
  );
}
