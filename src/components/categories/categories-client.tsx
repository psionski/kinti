"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { CategoryTree } from "./category-tree";
import { CategoryFormDialog, type CategoryFormData } from "./category-form-dialog";
import { MergeCategoryDialog } from "./merge-category-dialog";
import { DeleteCategoryDialog } from "./delete-category-dialog";
import type { CategoryWithCountResponse } from "@/lib/validators/categories";
import type { BudgetStatsItem } from "@/lib/validators/reports";
import { getCurrentMonth } from "@/lib/date-ranges";

interface CategoriesClientProps {
  initialCategories: CategoryWithCountResponse[];
  initialStats: BudgetStatsItem[];
}

export function CategoriesClient({
  initialCategories,
  initialStats,
}: CategoriesClientProps): React.ReactElement {
  const [categories, setCategories] = useState(initialCategories);
  const [stats, setStats] = useState(initialStats);
  const [loading, setLoading] = useState(false);

  // Dialog states
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryWithCountResponse | null>(null);
  const [mergingCategory, setMergingCategory] = useState<CategoryWithCountResponse | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<CategoryWithCountResponse | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  async function refresh(): Promise<void> {
    setLoading(true);
    try {
      const [catRes, statsRes] = await Promise.all([
        fetch("/api/categories"),
        fetch(`/api/reports/budget-stats?month=${getCurrentMonth()}`),
      ]);
      if (catRes.ok) setCategories((await catRes.json()) as CategoryWithCountResponse[]);
      if (statsRes.ok) setStats(((await statsRes.json()) as { items: BudgetStatsItem[] }).items);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(data: CategoryFormData): Promise<void> {
    setFormLoading(true);
    try {
      const body: Record<string, unknown> = { name: data.name };
      if (data.parentId) body.parentId = data.parentId;
      if (data.icon) body.icon = data.icon;
      if (data.color) body.color = data.color;

      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setShowCreateForm(false);
        void refresh();
      }
    } finally {
      setFormLoading(false);
    }
  }

  async function handleEdit(data: CategoryFormData): Promise<void> {
    if (!editingCategory) return;
    setFormLoading(true);
    try {
      const body: Record<string, unknown> = {
        name: data.name,
        parentId: data.parentId || null,
        icon: data.icon || null,
        color: data.color || null,
      };

      const res = await fetch(`/api/categories/${editingCategory.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setEditingCategory(null);
        void refresh();
      }
    } finally {
      setFormLoading(false);
    }
  }

  async function handleMerge(targetCategoryId: number): Promise<void> {
    if (!mergingCategory) return;
    setFormLoading(true);
    try {
      const res = await fetch("/api/categories/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceCategoryId: mergingCategory.id,
          targetCategoryId,
        }),
      });

      if (res.ok) {
        setMergingCategory(null);
        void refresh();
      }
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!deletingCategory) return;
    setFormLoading(true);
    try {
      const res = await fetch(`/api/categories/${deletingCategory.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setDeletingCategory(null);
        void refresh();
      }
    } finally {
      setFormLoading(false);
    }
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

      {/* Tree */}
      <div data-tour="category-tree" className={loading ? "pointer-events-none opacity-60" : ""}>
        <CategoryTree
          categories={categories}
          stats={stats}
          onEdit={setEditingCategory}
          onMerge={setMergingCategory}
          onDelete={setDeletingCategory}
        />
      </div>

      {/* Create dialog */}
      <CategoryFormDialog
        open={showCreateForm}
        onOpenChange={setShowCreateForm}
        categories={categories}
        onSubmit={(d) => void handleCreate(d)}
        loading={formLoading}
      />

      {/* Edit dialog */}
      <CategoryFormDialog
        key={editingCategory?.id ?? "new"}
        open={!!editingCategory}
        onOpenChange={(open) => {
          if (!open) setEditingCategory(null);
        }}
        categories={categories}
        onSubmit={(d) => void handleEdit(d)}
        initialData={editingCategory}
        loading={formLoading}
      />

      {/* Merge dialog */}
      <MergeCategoryDialog
        open={!!mergingCategory}
        onOpenChange={(open) => {
          if (!open) setMergingCategory(null);
        }}
        sourceCategory={mergingCategory}
        categories={categories}
        onConfirm={(targetId) => void handleMerge(targetId)}
        loading={formLoading}
      />

      {/* Delete dialog */}
      <DeleteCategoryDialog
        open={!!deletingCategory}
        onOpenChange={(open) => {
          if (!open) setDeletingCategory(null);
        }}
        category={deletingCategory}
        categories={categories}
        onConfirm={() => void handleDelete()}
        loading={formLoading}
      />
    </div>
  );
}
