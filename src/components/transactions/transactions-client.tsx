"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Trash2, FolderInput, ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import {
  TransactionFilterBar,
  EMPTY_FILTERS,
  type TransactionFilters,
} from "./transaction-filters";
import { TransactionTable } from "./transaction-table";
import { TransactionFormDialog, type TransactionFormData } from "./transaction-form";
import { RecategorizeDialog } from "./recategorize-dialog";
import { PaginationControls } from "./pagination-controls";
import { ReceiptDialog } from "@/components/receipts/receipt-dialog";
import { ReceiptUploadDialog } from "@/components/receipts/receipt-upload-dialog";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { useTransactionMutations } from "./use-transaction-mutations";
import type {
  TransactionResponse,
  PaginatedTransactionsResponse,
} from "@/lib/validators/transactions";
import type { CategoryWithCountResponse } from "@/lib/validators/categories";

interface TransactionsClientProps {
  initialData: PaginatedTransactionsResponse;
  categories: CategoryWithCountResponse[];
}

type SortField = "date" | "amount" | "merchant" | "createdAt";
type SortOrder = "asc" | "desc";

function buildQueryString(
  filters: TransactionFilters,
  sortBy: SortField,
  sortOrder: SortOrder,
  limit: number,
  offset: number
): string {
  const params = new URLSearchParams();
  params.set("sortBy", sortBy);
  params.set("sortOrder", sortOrder);
  params.set("limit", String(limit));
  params.set("offset", String(offset));

  if (filters.search) params.set("search", filters.search);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.type) params.set("type", filters.type);

  if (filters.categoryId === "uncategorized") {
    params.set("categoryId", "null");
  } else if (filters.categoryId) {
    params.set("categoryId", filters.categoryId);
  }

  if (filters.amountMin) {
    params.set("amountMin", String(parseFloat(filters.amountMin)));
  }
  if (filters.amountMax) {
    params.set("amountMax", String(parseFloat(filters.amountMax)));
  }

  if (filters.recurringId) params.set("recurringId", filters.recurringId);

  return params.toString();
}

export function TransactionsClient({
  initialData,
  categories,
}: TransactionsClientProps): React.ReactElement {
  const searchParams = useSearchParams();
  const initialFilters = useMemo((): TransactionFilters => {
    const categoryId = searchParams.get("categoryId");
    const recurringId = searchParams.get("recurringId");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const overrides: Partial<TransactionFilters> = {};
    if (categoryId) overrides.categoryId = categoryId;
    if (recurringId) overrides.recurringId = recurringId;
    if (dateFrom) overrides.dateFrom = dateFrom;
    if (dateTo) overrides.dateTo = dateTo;
    return { ...EMPTY_FILTERS, ...overrides };
  }, [searchParams]);

  const [data, setData] = useState<PaginatedTransactionsResponse>(initialData);
  const [filters, setFilters] = useState<TransactionFilters>(initialFilters);
  const [recurringName, setRecurringName] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortField>("date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);

  // Dialogs
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTx, setEditingTx] = useState<TransactionResponse | null>(null);
  const [showRecategorize, setShowRecategorize] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingTx, setDeletingTx] = useState<TransactionResponse | null>(null);
  const [viewingReceiptId, setViewingReceiptId] = useState<number | null>(null);
  const [showUploadReceipt, setShowUploadReceipt] = useState(false);

  const categoryMap = new Map<number, CategoryWithCountResponse>(categories.map((c) => [c.id, c]));

  const fetchTransactions = useCallback(
    async (
      f: TransactionFilters,
      sb: SortField,
      so: SortOrder,
      lim: number,
      off: number
    ): Promise<void> => {
      setLoading(true);
      try {
        const qs = buildQueryString(f, sb, so, lim, off);
        const res = await fetch(`/api/transactions?${qs}`);
        if (res.ok) {
          const json = (await res.json()) as PaginatedTransactionsResponse;
          setData(json);
        }
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const refresh = useCallback(() => {
    void fetchTransactions(filters, sortBy, sortOrder, limit, offset);
  }, [fetchTransactions, filters, sortBy, sortOrder, limit, offset]);

  const { formLoading, addTransaction, editTransaction, bulkDelete, recategorize } =
    useTransactionMutations(refresh);

  // Re-fetch when filters/sort/pagination change
  useEffect(() => {
    void fetchTransactions(filters, sortBy, sortOrder, limit, offset);
  }, [filters, sortBy, sortOrder, limit, offset, fetchTransactions]);

  // Fetch recurring template name when recurringId filter is active
  useEffect(() => {
    if (!filters.recurringId) {
      setRecurringName("");
      return;
    }
    fetch(`/api/recurring/${filters.recurringId}`)
      .then(async (res) => {
        if (res.ok) {
          const json = (await res.json()) as { description: string };
          setRecurringName(json.description);
        }
      })
      .catch(() => setRecurringName(""));
  }, [filters.recurringId]);

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

  async function handleAdd(formData: TransactionFormData): Promise<void> {
    if (await addTransaction(formData)) setShowAddForm(false);
  }

  async function handleEdit(formData: TransactionFormData): Promise<void> {
    if (!editingTx) return;
    if (await editTransaction(editingTx.id, formData)) setEditingTx(null);
  }

  async function handleBulkDelete(): Promise<void> {
    if (selectedIds.size === 0) return;
    setLoading(true);
    try {
      if (await bulkDelete(Array.from(selectedIds))) {
        setSelectedIds(new Set());
        setShowDeleteConfirm(false);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSingleDelete(): Promise<void> {
    if (!deletingTx) return;
    setLoading(true);
    try {
      if (await bulkDelete([deletingTx.id])) {
        setDeletingTx(null);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRecategorize(categoryId: number): Promise<void> {
    if (selectedIds.size === 0) return;
    if (await recategorize(Array.from(selectedIds), categoryId)) {
      setShowRecategorize(false);
      setSelectedIds(new Set());
    }
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
          recurringName={recurringName}
        />
      </div>

      {/* Table */}
      <div
        data-tour="transaction-table"
        className={loading ? "pointer-events-none opacity-60" : ""}
      >
        <TransactionTable
          transactions={data.data}
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
        total={data.total}
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
              disabled={loading}
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
        onOpenChange={setShowAddForm}
        categories={categories}
        onSubmit={(d) => void handleAdd(d)}
        loading={formLoading}
      />

      {/* Edit form dialog */}
      <TransactionFormDialog
        key={editingTx?.id ?? "new"}
        open={!!editingTx}
        onOpenChange={(open) => {
          if (!open) setEditingTx(null);
        }}
        categories={categories}
        onSubmit={(d) => void handleEdit(d)}
        initialData={editingTx}
        loading={formLoading}
      />

      {/* Recategorize dialog */}
      <RecategorizeDialog
        open={showRecategorize}
        onOpenChange={setShowRecategorize}
        selectedCount={selectedIds.size}
        categories={categories}
        onConfirm={(catId) => void handleRecategorize(catId)}
        loading={formLoading}
      />

      {/* Delete confirmation dialog */}
      <ConfirmDeleteDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete Transactions"
        description={
          <>
            Are you sure you want to delete <strong>{selectedIds.size}</strong> transaction(s)?
          </>
        }
        onConfirm={() => void handleBulkDelete()}
        loading={loading}
      />

      {/* Single delete confirmation dialog */}
      <ConfirmDeleteDialog
        open={!!deletingTx}
        onOpenChange={(open) => {
          if (!open) setDeletingTx(null);
        }}
        title="Delete Transaction"
        description={
          <>
            Are you sure you want to delete <strong>{deletingTx?.description}</strong>?
          </>
        }
        onConfirm={() => void handleSingleDelete()}
        loading={loading}
      />

      {/* Receipt detail dialog */}
      <ReceiptDialog
        receiptId={viewingReceiptId}
        onOpenChange={(open) => {
          if (!open) setViewingReceiptId(null);
        }}
        onDeleted={refresh}
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
