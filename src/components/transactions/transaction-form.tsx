"use client";

import { useState } from "react";
import { isoToday } from "@/lib/date-ranges";
import { getBaseCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategorySelectItems } from "@/components/categories/category-select-items";
import { CurrencyPicker } from "@/components/settings/currency-picker";
import type { CategoryWithCountResponse } from "@/lib/validators/categories";
import type { TransactionResponse } from "@/lib/validators/transactions";

interface TransactionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryWithCountResponse[];
  onSubmit: (data: TransactionFormData) => void;
  initialData?: TransactionResponse | null;
  loading?: boolean;
}

export interface TransactionFormData {
  amount: number;
  currency: string;
  type: "income" | "expense";
  description: string;
  merchant: string;
  categoryId: number | null;
  date: string;
  notes: string;
  tags: string[];
}

export function TransactionFormDialog({
  open,
  onOpenChange,
  categories,
  onSubmit,
  initialData,
  loading,
}: TransactionFormProps): React.ReactElement {
  const isEdit = !!initialData;

  const initialType: "income" | "expense" = initialData?.type === "income" ? "income" : "expense";
  const [type, setType] = useState<"income" | "expense">(initialType);
  const [amountStr, setAmountStr] = useState(initialData ? String(initialData.amount) : "");
  const [currency, setCurrency] = useState<string>(initialData?.currency ?? getBaseCurrency());
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [merchant, setMerchant] = useState(initialData?.merchant ?? "");
  const [categoryId, setCategoryId] = useState<string>(
    initialData?.categoryId ? String(initialData.categoryId) : "none"
  );
  const [date, setDate] = useState(initialData?.date ?? isoToday());
  const [notes, setNotes] = useState(initialData?.notes ?? "");
  const [tagsStr, setTagsStr] = useState(initialData?.tags?.join(", ") ?? "");
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    setError("");

    const amountNum = parseFloat(amountStr);
    if (Number.isNaN(amountNum) || amountNum <= 0) {
      setError("Amount must be a positive number");
      return;
    }
    if (!description.trim()) {
      setError("Description is required");
      return;
    }
    if (!date) {
      setError("Date is required");
      return;
    }

    const tags = tagsStr
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    onSubmit({
      amount: amountNum,
      currency,
      type,
      description: description.trim(),
      merchant: merchant.trim(),
      categoryId: categoryId === "none" ? null : Number(categoryId),
      date,
      notes: notes.trim(),
      tags,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Transaction" : "Add Transaction"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the transaction details."
              : "Enter the transaction details. Pick a currency to record a foreign-currency purchase."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={type === "expense" ? "default" : "outline"}
              size="sm"
              onClick={() => setType("expense")}
            >
              Expense
            </Button>
            <Button
              type="button"
              variant={type === "income" ? "default" : "outline"}
              size="sm"
              onClick={() => setType("income")}
            >
              Income
            </Button>
          </div>

          {/* Amount + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tx-amount">Amount</Label>
              <Input
                id="tx-amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tx-date">Date</Label>
              <Input
                id="tx-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Currency */}
          <div className="space-y-1.5">
            <Label htmlFor="tx-currency">Currency</Label>
            <CurrencyPicker id="tx-currency" value={currency} onChange={setCurrency} />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="tx-description">Description</Label>
            <Input
              id="tx-description"
              placeholder="e.g. Weekly groceries"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              required
            />
          </div>

          {/* Merchant */}
          <div className="space-y-1.5">
            <Label htmlFor="tx-merchant">Merchant</Label>
            <Input
              id="tx-merchant"
              placeholder="e.g. Lidl"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              maxLength={255}
            />
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="tx-category" className="w-full">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                <CategorySelectItems categories={categories} />
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="tx-notes">Notes</Label>
            <Input
              id="tx-notes"
              placeholder="Optional notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
            />
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label htmlFor="tx-tags">Tags (comma-separated)</Label>
            <Input
              id="tx-tags"
              placeholder="e.g. groceries, weekly"
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
            />
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading
                ? currency !== getBaseCurrency()
                  ? "Converting..."
                  : "Saving..."
                : isEdit
                  ? "Save Changes"
                  : "Add Transaction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
