"use client";

import { useState } from "react";
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
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategorySelectItems } from "@/components/categories/category-select-items";
import type { CategoryWithCountResponse } from "@/lib/validators/categories";
import type { BudgetStatusItem } from "@/lib/validators/reports";

interface BudgetFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryWithCountResponse[];
  currentMonth: string;
  onSubmit: (data: { categoryId: number; month: string; amount: number }) => void;
  initialData?: BudgetStatusItem | null;
  loading?: boolean;
}

export function BudgetFormDialog({
  open,
  onOpenChange,
  categories,
  currentMonth,
  onSubmit,
  initialData,
  loading,
}: BudgetFormDialogProps): React.ReactElement {
  const isEdit = !!initialData;
  const [categoryId, setCategoryId] = useState<string>(
    initialData ? String(initialData.categoryId) : ""
  );
  const [amount, setAmount] = useState(initialData ? String(initialData.budgetAmount) : "");
  const [error, setError] = useState("");

  function handleSubmit(e: React.SyntheticEvent): void {
    e.preventDefault();
    setError("");

    if (!categoryId) {
      setError("Please select a category.");
      return;
    }

    const parsed = parseFloat(amount);
    if (Number.isNaN(parsed) || parsed <= 0) {
      setError("Amount must be a positive number.");
      return;
    }

    onSubmit({
      categoryId: Number(categoryId),
      month: currentMonth,
      amount: parsed,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Budget" : "Set Budget"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Update the budget for ${initialData.categoryName}.`
              : "Set a monthly budget for a category."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="budget-category">Category</Label>
            {isEdit ? (
              <Input value={initialData.categoryName} disabled />
            ) : (
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger id="budget-category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  <CategorySelectItems categories={categories} />
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="budget-amount">Amount (EUR)</Label>
            <Input
              id="budget-amount"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="150.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : isEdit ? "Save Changes" : "Set Budget"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
