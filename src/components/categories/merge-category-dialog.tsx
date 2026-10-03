"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import { CategorySelectItems } from "./category-select-items";
import type { CategoryWithCountResponse } from "@/lib/validators/categories";

interface MergeCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceCategory: CategoryWithCountResponse | null;
  categories: CategoryWithCountResponse[];
  onConfirm: (targetCategoryId: number) => void;
  loading?: boolean;
  /** Why the last attempt failed, if it did. */
  error?: string | null;
}

export function MergeCategoryDialog({
  open,
  onOpenChange,
  sourceCategory,
  categories,
  onConfirm,
  loading,
  error,
}: MergeCategoryDialogProps): React.ReactElement {
  const [targetId, setTargetId] = useState<string>("");

  const targetOptions = categories.filter((c) => c.id !== sourceCategory?.id);

  function handleConfirm(): void {
    if (targetId) {
      onConfirm(Number(targetId));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge Category</DialogTitle>
          <DialogDescription>
            Merge <strong>{sourceCategory?.name}</strong> into another category. All{" "}
            {sourceCategory?.transactionCount ?? 0} transaction(s) will be moved to the target, and{" "}
            <strong>{sourceCategory?.name}</strong> will be deleted.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="merge-target">Target Category</Label>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger id="merge-target">
                <SelectValue placeholder="Select target category..." />
              </SelectTrigger>
              <SelectContent>
                <CategorySelectItems categories={targetOptions} />
              </SelectContent>
            </Select>
          </div>

          {targetId && sourceCategory && (
            <div className="bg-muted rounded-md p-3 text-sm">
              <p>
                <strong>{sourceCategory.transactionCount}</strong> transaction(s) will be moved to{" "}
                <strong>
                  {targetOptions.find((c) => c.id === Number(targetId))?.name ?? "target"}
                </strong>
                .
              </p>
              <p className="text-muted-foreground mt-1">
                Non-conflicting budgets will be transferred. The source category will be deleted.
              </p>
            </div>
          )}

          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={!targetId || loading}>
            {loading ? "Merging..." : "Merge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
