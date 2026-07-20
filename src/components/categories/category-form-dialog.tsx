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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CategoryWithCountResponse } from "@/lib/validators/categories";
import { CategorySelectItems } from "./category-select-items";

interface CategoryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryWithCountResponse[];
  onSubmit: (data: CategoryFormData) => void;
  initialData?: CategoryWithCountResponse | null;
  loading?: boolean;
}

export interface CategoryFormData {
  name: string;
  parentId: number | null;
  icon: string;
  color: string;
}

const COLOR_PRESETS = [
  "#EF4444",
  "#F97316",
  "#EAB308",
  "#22C55E",
  "#14B8A6",
  "#3B82F6",
  "#6366F1",
  "#A855F7",
  "#EC4899",
  "#6B7280",
];

/** Get all descendant IDs of a category (to prevent circular reparenting). */
function getDescendantIds(
  categoryId: number,
  categories: CategoryWithCountResponse[]
): Set<number> {
  const ids = new Set<number>();
  const queue = [categoryId];
  while (queue.length > 0) {
    const id = queue.pop()!;
    for (const cat of categories) {
      if (cat.parentId === id && !ids.has(cat.id)) {
        ids.add(cat.id);
        queue.push(cat.id);
      }
    }
  }
  return ids;
}

export function CategoryFormDialog({
  open,
  onOpenChange,
  categories,
  onSubmit,
  initialData,
  loading,
}: CategoryFormProps): React.ReactElement {
  const isEdit = !!initialData;

  const [name, setName] = useState(initialData?.name ?? "");
  const [parentId, setParentId] = useState<string>(
    initialData?.parentId ? String(initialData.parentId) : "none"
  );
  const [icon, setIcon] = useState(initialData?.icon ?? "");
  const [color, setColor] = useState(initialData?.color ?? "");
  const [error, setError] = useState("");

  // For edit mode, exclude self and descendants from parent options
  const excludedIds = initialData
    ? getDescendantIds(initialData.id, categories)
    : new Set<number>();
  const parentOptions = categories.filter(
    (c) => c.id !== initialData?.id && !excludedIds.has(c.id)
  );

  function handleSubmit(e: React.SyntheticEvent): void {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    if (color && !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) {
      setError("Color must be a valid hex color (e.g. #FF5733)");
      return;
    }

    onSubmit({
      name: name.trim(),
      parentId: parentId === "none" ? null : Number(parentId),
      icon: icon.trim(),
      color: color.trim(),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Category" : "New Category"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the category details."
              : "Create a new category to organize your transactions."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="cat-name">Name</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Groceries"
              maxLength={100}
            />
          </div>

          {/* Parent */}
          <div className="space-y-2">
            <Label htmlFor="cat-parent">Parent Category</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger id="cat-parent">
                <SelectValue placeholder="None (top-level)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (top-level)</SelectItem>
                <CategorySelectItems categories={parentOptions} />
              </SelectContent>
            </Select>
          </div>

          {/* Icon */}
          <div className="space-y-2">
            <Label htmlFor="cat-icon">Icon (emoji)</Label>
            <Input
              id="cat-icon"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="e.g. 🛒"
              maxLength={50}
            />
          </div>

          {/* Color */}
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setColor(color === preset ? "" : preset)}
                  className={`size-7 rounded-full border-2 transition-transform ${
                    color === preset ? "border-foreground scale-110" : "border-transparent"
                  }`}
                  style={{ backgroundColor: preset }}
                />
              ))}
            </div>
            <Input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="#FF5733"
              maxLength={7}
              className="mt-1"
            />
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : isEdit ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
