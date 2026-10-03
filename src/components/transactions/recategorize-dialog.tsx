"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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

interface RecategorizeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  categories: CategoryWithCountResponse[];
  onConfirm: (categoryId: number) => void;
  loading?: boolean;
  /** Why the last attempt failed, if it did. */
  error?: string | null;
}

export function RecategorizeDialog({
  open,
  onOpenChange,
  selectedCount,
  categories,
  onConfirm,
  loading,
  error,
}: RecategorizeDialogProps): React.ReactElement {
  const [categoryId, setCategoryId] = useState<string>("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Recategorize Transactions</DialogTitle>
          <DialogDescription>
            Move {selectedCount} selected transaction{selectedCount !== 1 ? "s" : ""} to a new
            category.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select target category" />
            </SelectTrigger>
            <SelectContent>
              <CategorySelectItems categories={categories} />
            </SelectContent>
          </Select>
          {error && <p className="text-destructive mt-2 text-sm">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!categoryId || loading} onClick={() => onConfirm(Number(categoryId))}>
            {loading ? "Moving..." : "Recategorize"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
