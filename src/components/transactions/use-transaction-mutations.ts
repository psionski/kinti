import { useState, useCallback } from "react";
import type { TransactionFormData } from "./transaction-form";

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function patchJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function deleteJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function buildCreateBody(data: TransactionFormData): Record<string, unknown> {
  const body: Record<string, unknown> = {
    amount: data.amount,
    currency: data.currency,
    type: data.type,
    description: data.description,
    date: data.date,
  };
  if (data.merchant) body.merchant = data.merchant;
  if (data.categoryId) body.categoryId = data.categoryId;
  if (data.notes) body.notes = data.notes;
  if (data.tags.length > 0) body.tags = data.tags;
  return body;
}

function buildUpdateBody(data: TransactionFormData): Record<string, unknown> {
  return {
    amount: data.amount,
    currency: data.currency,
    type: data.type,
    description: data.description,
    date: data.date,
    merchant: data.merchant || null,
    categoryId: data.categoryId,
    notes: data.notes || null,
    tags: data.tags.length > 0 ? data.tags : null,
  };
}

export interface UseTransactionMutationsResult {
  formLoading: boolean;
  addTransaction: (data: TransactionFormData) => Promise<boolean>;
  editTransaction: (id: number, data: TransactionFormData) => Promise<boolean>;
  bulkDelete: (ids: number[]) => Promise<boolean>;
  recategorize: (ids: number[], categoryId: number) => Promise<boolean>;
}

export function useTransactionMutations(onRefresh: () => void): UseTransactionMutationsResult {
  const [formLoading, setFormLoading] = useState(false);

  const addTransaction = useCallback(
    async (data: TransactionFormData): Promise<boolean> => {
      setFormLoading(true);
      try {
        const res = await postJson("/api/transactions", buildCreateBody(data));
        if (res.ok) {
          onRefresh();
          return true;
        }
        return false;
      } finally {
        setFormLoading(false);
      }
    },
    [onRefresh]
  );

  const editTransaction = useCallback(
    async (id: number, data: TransactionFormData): Promise<boolean> => {
      setFormLoading(true);
      try {
        const res = await patchJson(`/api/transactions/${id}`, buildUpdateBody(data));
        if (res.ok) {
          onRefresh();
          return true;
        }
        return false;
      } finally {
        setFormLoading(false);
      }
    },
    [onRefresh]
  );

  const bulkDelete = useCallback(
    async (ids: number[]): Promise<boolean> => {
      const res = await deleteJson("/api/transactions", { ids });
      if (res.ok) {
        onRefresh();
        return true;
      }
      return false;
    },
    [onRefresh]
  );

  const recategorize = useCallback(
    async (ids: number[], categoryId: number): Promise<boolean> => {
      setFormLoading(true);
      try {
        const updates = ids.map((id) => ({ id, categoryId }));
        const res = await patchJson("/api/transactions", { updates });
        if (res.ok) {
          onRefresh();
          return true;
        }
        return false;
      } finally {
        setFormLoading(false);
      }
    },
    [onRefresh]
  );

  return { formLoading, addTransaction, editTransaction, bulkDelete, recategorize };
}
