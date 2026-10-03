"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Plus, Trash2, FolderInput, ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { TransactionFilterBar } from "./transaction-filters";
import { TransactionTable } from "./transaction-table";
import { TransactionFormDialog, type TransactionFormData } from "./transaction-form";
import { RecategorizeDialog } from "./recategorize-dialog";
import { PaginationControls } from "./pagination-controls";
import { ReceiptDialog } from "@/components/receipts/receipt-dialog";
import { ReceiptUploadDialog } from "@/components/receipts/receipt-upload-dialog";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import {
  initialPageQuery,
  toListParams,
  type SortField,
  type SortOrder,
  type TransactionFilters,
} from "./transaction-query";
import { toCreateBody, toUpdateBody } from "./transaction-request";
import {
  transactionListQuery,
  useCreateTransaction,
  useDeleteTransactions,
  useUpdateTransaction,
  useUpdateTransactions,
} from "@/lib/queries/transactions";
import { categoryListQuery } from "@/lib/queries/categories";
import { recurringTemplateQuery } from "@/lib/queries/recurring";
import type { TransactionResponse } from "@/lib/validators/transactions";
import type { CategoryWithCountResponse } from "@/lib/validators/categories";
import { resetOnClose } from "@/components/shared/reset-on-close";

export function TransactionsClient(): React.ReactElement {
  const searchParams = useSearchParams();
  // The URL presets the first page only; after that the controls own the query.
  const [initialQuery] = useState(() => initialPageQuery((key) => searchParams.get(key)));

  const [filters, setFilters] = useState<TransactionFilters>(initialQuery.filters);
  const [sortBy, setSortBy] = useState<SortField>(initialQuery.sortBy);
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialQuery.sortOrder);
  const [limit, setLimit] = useState(initialQuery.limit);
  const [offset, setOffset] = useState(initialQuery.offset);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Dialogs
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTx, setEditingTx] = useState<TransactionResponse | null>(null);
  const [showRecategorize, setShowRecategorize] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingTx, setDeletingTx] = useState<TransactionResponse | null>(null);
  const [viewingReceiptId, setViewingReceiptId] = useState<number | null>(null);
  const [showUploadReceipt, setShowUploadReceipt] = useState(false);

  // While a new page loads, the old one stays on screen, dimmed.
  const list = useQuery({
    ...transactionListQuery(toListParams({ filters, sortBy, sortOrder, limit, offset })),
    placeholderData: keepPreviousData,
  });
  const page = list.data;
  const categories = useQuery(categoryListQuery()).data ?? [];
  const categoryMap = new Map<number, CategoryWithCountResponse>(categories.map((c) => [c.id, c]));

  const recurringId = filters.recurringId ? Number(filters.recurringId) : null;
  const recurring = useQuery({
    ...recurringTemplateQuery(recurringId ?? 0),
    enabled: recurringId !== null,
  });
  const recurringLabel =
    recurring.data?.description ?? (recurring.isError ? `#${filters.recurringId}` : "…");

  const createTx = useCreateTransaction();
  const updateTx = useUpdateTransaction();
  const recategorizeTx = useUpdateTransactions();
  const deleteTx = useDeleteTransactions();

  function handleSortChange(field: SortField): void {
    if (field === sortBy) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setOffset(0);
  }

  function handleFiltersChange(newFilters: TransactionFilters): void {
    setFilters(newFilters);
    setOffset(0);
    setSelectedIds(new Set());
  }

  function handleLimitChange(newLimit: number): void {
    setLimit(newLimit);
    setOffset(0);
  }

  function handleAdd(formData: TransactionFormData): void {
    createTx.mutate(toCreateBody(formData), { onSuccess: () => setShowAddForm(false) });
  }

  function handleEdit(formData: TransactionFormData): void {
    if (!editingTx) return;
    updateTx.mutate(
      { id: editingTx.id, ...toUpdateBody(formData) },
      { onSuccess: () => setEditingTx(null) }
    );
  }

  function handleBulkDelete(): void {
    if (selectedIds.size === 0) return;
    deleteTx.mutate(
      { ids: Array.from(selectedIds) },
      {
        onSuccess: () => {
          setSelectedIds(new Set());
          setShowDeleteConfirm(false);
        },
      }
    );
  }

  function handleSingleDelete(): void {
    if (!deletingTx) return;
    deleteTx.mutate({ ids: [deletingTx.id] }, { onSuccess: () => setDeletingTx(null) });
  }

  function handleRecategorize(categoryId: number): void {
    if (selectedIds.size === 0) return;
    recategorizeTx.mutate(
      { updates: Array.from(selectedIds, (id) => ({ id, categoryId })) },
      {
        onSuccess: () => {
          setShowRecategorize(false);
          setSelectedIds(new Set());
        },
      }
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader title="Transactions">
        <Button
          data-tour="add-receipt"
          variant="outline"
          size="sm"
          onClick={() => setShowUploadReceipt(true)}
        >
          <ScanLine className="size-4" />
          Add Receipt
        </Button>
        <Button data-tour="add-transaction" onClick={() => setShowAddForm(true)} size="sm">
          <Plus className="size-4" />
          Add Transaction
        </Button>
      </PageHeader>

      {/* Filters */}
      <div data-tour="transaction-filters">
        <TransactionFilterBar
          filters={filters}
          categories={categories}
          onFiltersChange={handleFiltersChange}
          recurringLabel={recurringLabel}
        />
      </div>

      {/* Table */}
      {list.isError && (
        <p className="text-destructive text-sm">
          Couldn&apos;t load transactions: {list.error.message}
        </p>
      )}
      <div
        data-tour="transaction-table"
        className={list.isPlaceholderData || list.isPending ? "pointer-events-none opacity-60" : ""}
      >
        <TransactionTable
          transactions={page?.data ?? []}
          categories={categoryMap}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={handleSortChange}
          onEdit={setEditingTx}
          onDelete={setDeletingTx}
          onReceiptClick={setViewingReceiptId}
        />
      </div>

      {/* Pagination */}
      <PaginationControls
        total={page?.total ?? 0}
        limit={limit}
        offset={offset}
        onPageChange={setOffset}
        onLimitChange={handleLimitChange}
      />

      {/* Floating bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-16 z-20 flex justify-center px-4 md:bottom-6">
          <div className="bg-popover animate-in slide-in-from-bottom-2 fade-in pointer-events-auto flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm shadow-lg duration-200">
            <span className="font-medium whitespace-nowrap">{selectedIds.size} selected</span>
            <div className="bg-border mx-0.5 h-4 w-px" />
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-1.5 rounded-full"
              onClick={() => setShowRecategorize(true)}
            >
              <FolderInput className="size-4" />
              <span className="hidden sm:inline">Recategorize</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive h-9 gap-1.5 rounded-full"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleteTx.isPending}
            >
              <Trash2 className="size-4" />
              <span className="hidden sm:inline">Delete</span>
            </Button>
            <div className="bg-border mx-0.5 h-4 w-px" />
            <Button
              variant="ghost"
              size="icon"
              className="size-9 rounded-full"
              onClick={() => setSelectedIds(new Set())}
            >
              <X className="size-4" />
              <span className="sr-only">Clear selection</span>
            </Button>
          </div>
        </div>
      )}

      {/* Add form dialog */}
      <TransactionFormDialog
        key={String(showAddForm)}
        open={showAddForm}
        onOpenChange={resetOnClose(() => setShowAddForm(false), createTx)}
        categories={categories}
        onSubmit={handleAdd}
        loading={createTx.isPending}
        submitError={createTx.error?.message}
      />

      {/* Edit form dialog */}
      <TransactionFormDialog
        key={editingTx?.id ?? "new"}
        open={!!editingTx}
        onOpenChange={resetOnClose(() => setEditingTx(null), updateTx)}
        categories={categories}
        onSubmit={handleEdit}
        initialData={editingTx}
        loading={updateTx.isPending}
        submitError={updateTx.error?.message}
      />

      {/* Recategorize dialog. Keyed so each opening starts with no category picked. */}
      <RecategorizeDialog
        key={String(showRecategorize)}
        open={showRecategorize}
        onOpenChange={resetOnClose(() => setShowRecategorize(false), recategorizeTx)}
        selectedCount={selectedIds.size}
        categories={categories}
        onConfirm={handleRecategorize}
        loading={recategorizeTx.isPending}
        error={recategorizeTx.error?.message}
      />

      {/* Delete confirmation dialog */}
      <ConfirmDeleteDialog
        open={showDeleteConfirm}
        onOpenChange={resetOnClose(() => setShowDeleteConfirm(false), deleteTx)}
        title="Delete Transactions"
        description={
          <>
            Are you sure you want to delete <strong>{selectedIds.size}</strong> transaction(s)?
          </>
        }
        onConfirm={handleBulkDelete}
        loading={deleteTx.isPending}
        error={deleteTx.error?.message}
      />

      {/* Single delete confirmation dialog */}
      <ConfirmDeleteDialog
        open={!!deletingTx}
        onOpenChange={resetOnClose(() => setDeletingTx(null), deleteTx)}
        title="Delete Transaction"
        description={
          <>
            Are you sure you want to delete <strong>{deletingTx?.description}</strong>?
          </>
        }
        onConfirm={handleSingleDelete}
        loading={deleteTx.isPending}
        error={deleteTx.error?.message}
      />

      {/* Receipt detail dialog */}
      <ReceiptDialog
        receiptId={viewingReceiptId}
        onOpenChange={(open) => {
          if (!open) setViewingReceiptId(null);
        }}
      />

      {/* Receipt upload dialog */}
      <ReceiptUploadDialog
        open={showUploadReceipt}
        onOpenChange={setShowUploadReceipt}
        onUploaded={(receiptId) => setViewingReceiptId(receiptId)}
      />
    </div>
  );
}
