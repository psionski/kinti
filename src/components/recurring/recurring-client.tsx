"use client";

import { useState, useCallback } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { RecurringTable } from "./recurring-table";
import { RecurringFormDialog } from "./recurring-form-dialog";
import { DeleteRecurringDialog } from "./delete-recurring-dialog";
import type { RecurringResponse } from "@/lib/validators/recurring";
import type { CategoryWithCountResponse } from "@/lib/validators/categories";

interface RecurringClientProps {
  initialRecurring: RecurringResponse[];
  initialCategories: CategoryWithCountResponse[];
}

export function RecurringClient({
  initialRecurring,
  initialCategories,
}: RecurringClientProps): React.ReactElement {
  const [recurring, setRecurring] = useState(initialRecurring);
  const [categories] = useState(initialCategories);
  const [loading, setLoading] = useState(false);
  const [formLoading, setFormLoading] = useState(false);

  // Dialog states
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<RecurringResponse | null>(null);
  const [deletingItem, setDeletingItem] = useState<RecurringResponse | null>(null);

  const categoryMap = new Map<number, CategoryWithCountResponse>(categories.map((c) => [c.id, c]));

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const res = await fetch("/api/recurring");
      if (res.ok) setRecurring((await res.json()) as RecurringResponse[]);
    } finally {
      setLoading(false);
    }
  }, []);

  async function handleCreate(data: Record<string, unknown>): Promise<void> {
    setFormLoading(true);
    try {
      const res = await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setShowForm(false);
        void refresh();
      }
    } finally {
      setFormLoading(false);
    }
  }

  async function handleUpdate(data: Record<string, unknown>): Promise<void> {
    if (!editingItem) return;
    setFormLoading(true);
    try {
      const res = await fetch(`/api/recurring/${editingItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setEditingItem(null);
        void refresh();
      }
    } finally {
      setFormLoading(false);
    }
  }

  async function handleToggleActive(item: RecurringResponse): Promise<void> {
    setLoading(true);
    try {
      await fetch(`/api/recurring/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: item.isActive === 0 }),
      });
      void refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!deletingItem) return;
    setFormLoading(true);
    try {
      const res = await fetch(`/api/recurring/${deletingItem.id}`, { method: "DELETE" });
      if (res.ok) {
        setDeletingItem(null);
        void refresh();
      }
    } finally {
      setFormLoading(false);
    }
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

      {/* Table */}
      <div className={loading ? "pointer-events-none opacity-60" : ""}>
        <RecurringTable
          items={recurring}
          categories={categoryMap}
          onEdit={setEditingItem}
          onDelete={setDeletingItem}
          onToggleActive={(item) => void handleToggleActive(item)}
        />
      </div>

      {/* Create dialog */}
      <RecurringFormDialog
        key={String(showForm)}
        open={showForm}
        onOpenChange={setShowForm}
        categories={categories}
        onSubmit={(d) => void handleCreate(d)}
        loading={formLoading}
      />

      {/* Edit dialog */}
      <RecurringFormDialog
        key={editingItem?.id ?? "new"}
        open={!!editingItem}
        onOpenChange={(open) => {
          if (!open) setEditingItem(null);
        }}
        categories={categories}
        onSubmit={(d) => void handleUpdate(d)}
        initialData={editingItem}
        loading={formLoading}
      />

      {/* Delete dialog */}
      <DeleteRecurringDialog
        open={!!deletingItem}
        onOpenChange={(open) => {
          if (!open) setDeletingItem(null);
        }}
        item={deletingItem}
        onConfirm={() => void handleDelete()}
        loading={formLoading}
      />
    </div>
  );
}
